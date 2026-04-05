"""Business expense ledger with budget tracking and receipt uploads."""

import os
import uuid as uuid_mod
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func as sqf
from sqlalchemy.orm import Session

from audit import audit, diff, snapshot, get_user_id
from database import get_db
from models import Budget, BusinessExpense, DailyBlockLog, DailyExpense
from role_guard import require_role

router = APIRouter(prefix="/expenses", tags=["expenses"])

UPLOADS_DIR = Path("/app/uploads/receipts")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

BUDGET_CATEGORIES = [
    "fuel", "vehicle_maintenance", "vehicle_supplies", "vehicle_rental",
    "insurance", "tolls_parking", "food_meals", "technology",
    "licensing", "professional_services", "other",
]

# Map daily_expenses.category → budget category
DAILY_TO_BUDGET = {
    "gas": "fuel", "tolls": "tolls_parking", "parking": "tolls_parking",
    "car_wash": "vehicle_supplies", "food": "food_meals", "other": "other",
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    date: date
    budget_category: str = Field(pattern="^(" + "|".join(BUDGET_CATEGORIES) + ")$")
    amount: float = Field(ge=0)
    vendor: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=256)
    notes: str | None = None

class ExpenseUpdate(BaseModel):
    expense_date: date | None = None
    budget_category: str | None = None
    amount: float | None = Field(default=None, ge=0)
    vendor: str | None = None
    description: str | None = None
    notes: str | None = None

class ExpenseResponse(BaseModel):
    id: UUID
    date: date
    budget_category: str
    amount: float
    vendor: str | None
    description: str | None
    receipt_path: str | None
    notes: str | None
    created_at: str

class BudgetResponse(BaseModel):
    id: UUID
    budget_category: str
    monthly_amount: float
    notes: str | None

class BudgetUpdate(BaseModel):
    monthly_amount: float = Field(ge=0)
    notes: str | None = None

class BudgetSummaryRow(BaseModel):
    budget_category: str
    monthly_amount: float
    spent: float
    remaining: float
    pct_used: float


# ── Expense CRUD ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[ExpenseResponse], dependencies=[require_role('ADMIN', 'OPERATOR', 'VIEWER')])
def list_expenses(
    db: Session = Depends(get_db),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    category: str | None = None,
    limit: int = Query(default=100, le=500),
):
    q = db.query(BusinessExpense).filter(BusinessExpense.deleted_at.is_(None))
    if from_date:
        q = q.filter(BusinessExpense.date >= from_date)
    if to_date:
        q = q.filter(BusinessExpense.date <= to_date)
    if category:
        q = q.filter(BusinessExpense.budget_category == category)
    expenses = q.order_by(BusinessExpense.date.desc()).limit(limit).all()
    return [_exp_response(e) for e in expenses]

@router.post("", response_model=ExpenseResponse, status_code=201, dependencies=[require_role('ADMIN', 'OPERATOR')])
def create_expense(body: ExpenseCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    exp = BusinessExpense(created_by=user_id, **body.model_dump())
    db.add(exp)
    db.flush()
    audit(db, "business_expenses", exp.id, "CREATE", user_id, snapshot({
        "date": str(body.date), "budget_category": body.budget_category,
        "amount": float(body.amount), "vendor": body.vendor,
    }))
    db.commit()
    db.refresh(exp)
    return _exp_response(exp)

@router.put("/{expense_id}", response_model=ExpenseResponse, dependencies=[require_role('ADMIN', 'OPERATOR')])
def update_expense(expense_id: UUID, body: ExpenseUpdate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    exp = db.get(BusinessExpense, expense_id)
    if exp is None or exp.deleted_at is not None:
        raise HTTPException(404, "Expense not found")
    old = {"date": str(exp.date), "budget_category": exp.budget_category, "amount": float(exp.amount), "vendor": exp.vendor}
    updates = body.model_dump(exclude_none=True)
    if "expense_date" in updates:
        updates["date"] = updates.pop("expense_date")
    for field, value in updates.items():
        setattr(exp, field, value)
    new = {"date": str(exp.date), "budget_category": exp.budget_category, "amount": float(exp.amount), "vendor": exp.vendor}
    changes = diff(old, new)
    if changes:
        audit(db, "business_expenses", exp.id, "UPDATE", user_id, changes)
    db.commit()
    db.refresh(exp)
    return _exp_response(exp)

@router.delete("/{expense_id}", status_code=204, dependencies=[require_role('ADMIN', 'OPERATOR')])
def delete_expense(expense_id: UUID, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    exp = db.get(BusinessExpense, expense_id)
    if exp is None or exp.deleted_at is not None:
        raise HTTPException(404, "Expense not found")
    exp.deleted_at = datetime.now(timezone.utc)
    exp.deleted_by = user_id
    audit(db, "business_expenses", exp.id, "DELETE", user_id, snapshot({
        "date": str(exp.date), "budget_category": exp.budget_category, "amount": float(exp.amount),
    }))
    db.commit()


# ── Receipt upload ────────────────────────────────────────────────────────────

@router.post("/{expense_id}/receipt", response_model=ExpenseResponse, dependencies=[require_role('ADMIN', 'OPERATOR')])
async def upload_receipt(expense_id: UUID, file: UploadFile = File(...), db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    exp = db.get(BusinessExpense, expense_id)
    if exp is None or exp.deleted_at is not None:
        raise HTTPException(404, "Expense not found")

    ext = Path(file.filename).suffix.lower() if file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type not allowed. Use: {', '.join(ALLOWED_EXTENSIONS)}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large. Max 10MB.")

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid_mod.uuid4()}{ext}"
    filepath = UPLOADS_DIR / filename
    filepath.write_bytes(content)

    exp.receipt_path = f"receipts/{filename}"
    audit(db, "business_expenses", exp.id, "UPDATE", user_id, {"receipt_path": {"old": None, "new": exp.receipt_path}})
    db.commit()
    db.refresh(exp)
    return _exp_response(exp)

@router.get("/{expense_id}/receipt", dependencies=[require_role('ADMIN', 'OPERATOR', 'VIEWER')])
def get_receipt(expense_id: UUID, db: Session = Depends(get_db)):
    exp = db.get(BusinessExpense, expense_id)
    if exp is None or exp.deleted_at is not None or not exp.receipt_path:
        raise HTTPException(404, "Receipt not found")
    filepath = Path("/app/uploads") / exp.receipt_path
    if not filepath.exists():
        raise HTTPException(404, "Receipt file missing")
    return FileResponse(filepath)


# ── Budgets ───────────────────────────────────────────────────────────────────

@router.get("/budgets", response_model=list[BudgetResponse], dependencies=[require_role('ADMIN', 'OPERATOR', 'VIEWER')])
def list_budgets(db: Session = Depends(get_db)):
    return [BudgetResponse(id=b.id, budget_category=b.budget_category, monthly_amount=float(b.monthly_amount), notes=b.notes)
            for b in db.query(Budget).order_by(Budget.budget_category).all()]

@router.put("/budgets/{category}", response_model=BudgetResponse, dependencies=[require_role('ADMIN')])
def update_budget(category: str, body: BudgetUpdate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    b = db.query(Budget).filter(Budget.budget_category == category).first()
    if b is None:
        raise HTTPException(404, "Budget category not found")
    old_amt = float(b.monthly_amount)
    b.monthly_amount = body.monthly_amount
    if body.notes is not None:
        b.notes = body.notes
    if old_amt != body.monthly_amount:
        audit(db, "budgets", b.id, "UPDATE", user_id, {"monthly_amount": {"old": old_amt, "new": body.monthly_amount}})
    db.commit()
    db.refresh(b)
    return BudgetResponse(id=b.id, budget_category=b.budget_category, monthly_amount=float(b.monthly_amount), notes=b.notes)

@router.get("/budgets/summary", response_model=list[BudgetSummaryRow], dependencies=[require_role('ADMIN', 'OPERATOR', 'VIEWER')])
def budget_summary(db: Session = Depends(get_db), month: str = Query(...)):
    """Budget vs actual for a given month (YYYY-MM). Combines business_expenses + daily_expenses."""
    try:
        year, mon = map(int, month.split("-"))
    except ValueError:
        raise HTTPException(422, "month must be YYYY-MM")

    from datetime import date as d
    month_start = d(year, mon, 1)
    month_end = d(year, mon + 1, 1) if mon < 12 else d(year + 1, 1, 1)

    # Business expenses by category
    biz = (
        db.query(BusinessExpense.budget_category, sqf.coalesce(sqf.sum(BusinessExpense.amount), 0))
        .filter(BusinessExpense.date >= month_start, BusinessExpense.date < month_end, BusinessExpense.deleted_at.is_(None))
        .group_by(BusinessExpense.budget_category)
        .all()
    )
    biz_map = {cat: float(amt) for cat, amt in biz}

    # Daily expenses by category, mapped to budget categories
    daily = (
        db.query(DailyExpense.category, sqf.coalesce(sqf.sum(DailyExpense.amount), 0))
        .join(DailyBlockLog, DailyBlockLog.id == DailyExpense.daily_block_log_id)
        .filter(DailyBlockLog.entry_date >= month_start, DailyBlockLog.entry_date < month_end,
                DailyBlockLog.deleted_at.is_(None), DailyExpense.deleted_at.is_(None))
        .group_by(DailyExpense.category)
        .all()
    )
    for cat, amt in daily:
        budget_cat = DAILY_TO_BUDGET.get(cat, "other")
        biz_map[budget_cat] = biz_map.get(budget_cat, 0) + float(amt)

    # Build summary with budget allocations
    budgets = {b.budget_category: float(b.monthly_amount) for b in db.query(Budget).all()}
    rows = []
    for cat in BUDGET_CATEGORIES:
        allocated = budgets.get(cat, 0)
        spent = biz_map.get(cat, 0)
        rows.append(BudgetSummaryRow(
            budget_category=cat,
            monthly_amount=round(allocated, 2),
            spent=round(spent, 2),
            remaining=round(allocated - spent, 2),
            pct_used=round(spent / allocated * 100, 1) if allocated > 0 else 0,
        ))
    return rows


# ── Helpers ───────────────────────────────────────────────────────────────────

def _exp_response(e: BusinessExpense) -> ExpenseResponse:
    return ExpenseResponse(
        id=e.id, date=e.date, budget_category=e.budget_category,
        amount=float(e.amount), vendor=e.vendor, description=e.description,
        receipt_path=e.receipt_path, notes=e.notes,
        created_at=e.created_at.isoformat(),
    )
