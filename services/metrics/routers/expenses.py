"""Business expense ledger with budget tracking and receipt uploads (DB storage)."""

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func as sqf
from sqlalchemy.orm import Session

from audit import audit, diff, snapshot, get_user_id
from database import get_db
from models import Budget, BudgetCategory, BusinessExpense, DailyBlockLog, DailyExpense, RecurringExpense
from role_guard import require_role

router = APIRouter(prefix="/expenses", tags=["expenses"])

ALLOWED_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"}
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
    budget_category: str = Field(max_length=32)
    amount: float = Field(ge=0)
    vendor: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=256)
    vehicle_id: UUID | None = None
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
    has_receipt: bool
    notes: str | None
    created_at: str

class BudgetCategoryResponse(BaseModel):
    id: UUID
    name: str
    label: str
    tax_deductible: bool
    tax_notes: str | None
    sort_order: int
    active: bool

class BudgetCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=32, pattern="^[a-z][a-z0-9_]*$")
    label: str = Field(min_length=1, max_length=64)
    tax_deductible: bool = False
    tax_notes: str | None = None
    sort_order: int = 0

class BudgetCategoryUpdate(BaseModel):
    label: str | None = None
    tax_deductible: bool | None = None
    tax_notes: str | None = None
    sort_order: int | None = None

class BudgetResponse(BaseModel):
    id: UUID
    budget_category: str
    label: str
    monthly_amount: float
    tax_deductible: bool
    tax_notes: str | None
    notes: str | None

class BudgetCreate(BaseModel):
    budget_category: str
    month: str = Field(pattern="^\\d{4}-\\d{2}$")
    monthly_amount: float = Field(ge=0)
    notes: str | None = None

class BudgetUpdate(BaseModel):
    monthly_amount: float = Field(ge=0)
    notes: str | None = None

class BudgetSummaryRow(BaseModel):
    budget_category: str
    label: str
    monthly_amount: float
    spent: float
    remaining: float
    pct_used: float
    tax_deductible: bool
    tax_notes: str | None


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
    cat = db.query(BudgetCategory).filter(BudgetCategory.name == body.budget_category).first()
    if cat is None:
        raise HTTPException(400, f"Unknown budget category: {body.budget_category}")
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

    mime = file.content_type or ""
    if mime not in ALLOWED_MIMES:
        raise HTTPException(400, f"File type not allowed. Use: {', '.join(ALLOWED_MIMES)}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large. Max 10MB.")

    exp.receipt_data = content
    exp.receipt_mime = mime
    audit(db, "business_expenses", exp.id, "UPDATE", user_id, {"receipt": {"old": None, "new": f"{mime} ({len(content)} bytes)"}})
    db.commit()
    db.refresh(exp)
    return _exp_response(exp)

@router.get("/{expense_id}/receipt", dependencies=[require_role('ADMIN', 'OPERATOR', 'VIEWER')])
def get_receipt(expense_id: UUID, db: Session = Depends(get_db)):
    exp = db.get(BusinessExpense, expense_id)
    if exp is None or exp.deleted_at is not None or not exp.receipt_data:
        raise HTTPException(404, "Receipt not found")
    return Response(content=exp.receipt_data, media_type=exp.receipt_mime)


# ── Budget Categories (master list) ───────────────────────────────────────────

def _cat_response(c: BudgetCategory) -> BudgetCategoryResponse:
    return BudgetCategoryResponse(id=c.id, name=c.name, label=c.label,
        tax_deductible=c.tax_deductible, tax_notes=c.tax_notes,
        sort_order=c.sort_order, active=c.active)

@router.get("/budget-categories", response_model=list[BudgetCategoryResponse], dependencies=[require_role("ADMIN", "OPERATOR", "VIEWER")])
def list_categories(db: Session = Depends(get_db), include_inactive: bool = Query(default=False)):
    q = db.query(BudgetCategory)
    if not include_inactive:
        q = q.filter(BudgetCategory.active.is_(True))
    return [_cat_response(c) for c in q.order_by(BudgetCategory.sort_order).all()]

@router.post("/budget-categories", response_model=BudgetCategoryResponse, status_code=201, dependencies=[require_role("ADMIN")])
def create_category(body: BudgetCategoryCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    existing = db.query(BudgetCategory).filter(BudgetCategory.name == body.name).first()
    if existing:
        raise HTTPException(409, "Category name already exists")
    c = BudgetCategory(**body.model_dump())
    db.add(c)
    db.flush()
    audit(db, "budget_categories", c.id, "CREATE", user_id, snapshot({"name": c.name, "label": c.label, "tax_deductible": c.tax_deductible}))
    db.commit()
    db.refresh(c)
    return _cat_response(c)

@router.put("/budget-categories/{name}", response_model=BudgetCategoryResponse, dependencies=[require_role("ADMIN")])
def update_category(name: str, body: BudgetCategoryUpdate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    c = db.query(BudgetCategory).filter(BudgetCategory.name == name).first()
    if c is None:
        raise HTTPException(404, "Category not found")
    old = {"label": c.label, "tax_deductible": c.tax_deductible}
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(c, field, value)
    changes = diff(old, {"label": c.label, "tax_deductible": c.tax_deductible})
    if changes:
        audit(db, "budget_categories", c.id, "UPDATE", user_id, changes)
    db.commit()
    db.refresh(c)
    return _cat_response(c)

@router.delete("/budget-categories/{name}", status_code=204, dependencies=[require_role("ADMIN")])
def disable_category(name: str, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    c = db.query(BudgetCategory).filter(BudgetCategory.name == name).first()
    if c is None:
        raise HTTPException(404, "Category not found")
    c.active = False
    audit(db, "budget_categories", c.id, "UPDATE", user_id, {"active": {"old": True, "new": False}})
    db.commit()


# ── Budgets (monthly allocations) ─────────────────────────────────────────────

def _budget_response(b: Budget, cat_map: dict) -> BudgetResponse:
    c = cat_map.get(b.budget_category)
    return BudgetResponse(id=b.id, budget_category=b.budget_category,
        label=c.label if c else b.budget_category,
        monthly_amount=float(b.monthly_amount),
        tax_deductible=c.tax_deductible if c else False,
        tax_notes=c.tax_notes if c else None,
        notes=b.notes)

def _cat_map(db: Session) -> dict:
    return {c.name: c for c in db.query(BudgetCategory).all()}

@router.get("/budgets", response_model=list[BudgetResponse], dependencies=[require_role("ADMIN", "OPERATOR", "VIEWER")])
def list_budgets(db: Session = Depends(get_db), month: str = Query(default=None)):
    if not month:
        month = date.today().strftime("%Y-%m")
    cm = _cat_map(db)
    return [_budget_response(b, cm) for b in db.query(Budget).filter(Budget.month == month).order_by(Budget.budget_category).all()]

@router.post("/budgets", response_model=BudgetResponse, status_code=201, dependencies=[require_role("ADMIN")])
def add_budget_item(body: BudgetCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    cat = db.query(BudgetCategory).filter(BudgetCategory.name == body.budget_category).first()
    if cat is None:
        raise HTTPException(404, "Category not found in master list")
    existing = db.query(Budget).filter(Budget.budget_category == body.budget_category, Budget.month == body.month).first()
    if existing:
        raise HTTPException(409, f"{body.budget_category} already exists for {body.month}")
    b = Budget(budget_category=body.budget_category, month=body.month, monthly_amount=body.monthly_amount, notes=body.notes)
    db.add(b)
    db.flush()
    audit(db, "budgets", b.id, "CREATE", user_id, snapshot({"category": body.budget_category, "month": body.month, "amount": float(body.monthly_amount)}))
    db.commit()
    db.refresh(b)
    return _budget_response(b, _cat_map(db))

@router.put("/budgets/{category}", response_model=BudgetResponse, dependencies=[require_role("ADMIN")])
def update_budget(category: str, body: BudgetUpdate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id), month: str = Query(default=None)):
    if not month:
        month = date.today().strftime("%Y-%m")
    b = db.query(Budget).filter(Budget.budget_category == category, Budget.month == month).first()
    if b is None:
        raise HTTPException(404, "Budget not found for that category/month")
    old_amt = float(b.monthly_amount)
    b.monthly_amount = body.monthly_amount
    if body.notes is not None:
        b.notes = body.notes
    if old_amt != body.monthly_amount:
        audit(db, "budgets", b.id, "UPDATE", user_id, {"monthly_amount": {"old": old_amt, "new": body.monthly_amount}, "month": month})
    db.commit()
    db.refresh(b)
    return _budget_response(b, _cat_map(db))

@router.delete("/budgets/{category}", status_code=204, dependencies=[require_role("ADMIN")])
def remove_budget_item(category: str, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id), month: str = Query(default=None)):
    if not month:
        month = date.today().strftime("%Y-%m")
    b = db.query(Budget).filter(Budget.budget_category == category, Budget.month == month).first()
    if b is None:
        raise HTTPException(404, "Budget not found for that category/month")
    audit(db, "budgets", b.id, "DELETE", user_id, snapshot({"category": category, "month": month, "amount": float(b.monthly_amount)}))
    db.delete(b)
    db.commit()

@router.post("/budgets/copy", dependencies=[require_role("ADMIN")])
def copy_budgets(db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id),
                 from_month: str = Query(..., alias="from"), to_month: str = Query(..., alias="to")):
    source = db.query(Budget).filter(Budget.month == from_month).all()
    if not source:
        raise HTTPException(404, f"No budgets found for {from_month}")
    existing = db.query(Budget).filter(Budget.month == to_month).all()
    if existing:
        raise HTTPException(409, f"Budgets already exist for {to_month}")
    for b in source:
        db.add(Budget(budget_category=b.budget_category, month=to_month, monthly_amount=b.monthly_amount, notes=b.notes))
    db.flush()
    audit(db, "budgets", source[0].id, "CREATE", user_id, {"action": f"copied {len(source)} budgets {from_month} -> {to_month}"})
    db.commit()
    return {"copied": len(source), "from_month": from_month, "to_month": to_month}

@router.get("/budgets/months", dependencies=[require_role("ADMIN", "OPERATOR", "VIEWER")])
def list_budget_months(db: Session = Depends(get_db)):
    rows = db.query(Budget.month).distinct().order_by(Budget.month).all()
    return [r[0] for r in rows]

@router.get("/budgets/summary", response_model=list[BudgetSummaryRow], dependencies=[require_role("ADMIN", "OPERATOR", "VIEWER")])
def budget_summary(db: Session = Depends(get_db), month: str = Query(...)):
    try:
        year, mon = map(int, month.split("-"))
    except ValueError:
        raise HTTPException(422, "month must be YYYY-MM")

    from datetime import date as d
    month_start = d(year, mon, 1)
    month_end = d(year, mon + 1, 1) if mon < 12 else d(year + 1, 1, 1)

    biz = (
        db.query(BusinessExpense.budget_category, sqf.coalesce(sqf.sum(BusinessExpense.amount), 0))
        .filter(BusinessExpense.date >= month_start, BusinessExpense.date < month_end, BusinessExpense.deleted_at.is_(None))
        .group_by(BusinessExpense.budget_category)
        .all()
    )
    biz_map = {cat: float(amt) for cat, amt in biz}

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

    cm = _cat_map(db)
    budget_objs = {b.budget_category: b for b in db.query(Budget).filter(Budget.month == month).all()}
    # Include all categories that have either a budget allocation or spending
    all_cats = set(budget_objs.keys()) | set(biz_map.keys())
    rows = []
    for cat in sorted(all_cats):
        b = budget_objs.get(cat)
        c = cm.get(cat)
        allocated = float(b.monthly_amount) if b else 0
        spent = biz_map.get(cat, 0)
        rows.append(BudgetSummaryRow(
            budget_category=cat,
            label=c.label if c else cat,
            monthly_amount=round(allocated, 2),
            spent=round(spent, 2),
            remaining=round(allocated - spent, 2),
            pct_used=round(spent / allocated * 100, 1) if allocated > 0 else 0,
            tax_deductible=c.tax_deductible if c else False,
            tax_notes=c.tax_notes if c else None,
        ))
    return rows


# ── Helpers ───────────────────────────────────────────────────────────────────

def _exp_response(e: BusinessExpense) -> ExpenseResponse:
    return ExpenseResponse(
        id=e.id, date=e.date, budget_category=e.budget_category,
        amount=float(e.amount), vendor=e.vendor, description=e.description,
        has_receipt=e.receipt_data is not None, notes=e.notes,
        created_at=e.created_at.isoformat(),
    )


# ── Recurring Expenses ────────────────────────────────────────────────────────

FREQUENCIES = ["weekly", "biweekly", "monthly", "quarterly", "annual"]
FREQ_TO_MONTHLY = {"weekly": 4.3, "biweekly": 2.15, "monthly": 1.0, "quarterly": 1/3, "annual": 1/12}

class RecurringExpenseCreate(BaseModel):
    budget_category: str
    amount: float = Field(ge=0)
    frequency: str
    vendor: str | None = Field(default=None, max_length=128)
    description: str | None = Field(default=None, max_length=256)
    start_date: date
    end_date: date | None = None

class RecurringExpenseUpdate(BaseModel):
    amount: float | None = Field(default=None, ge=0)
    frequency: str | None = None
    vendor: str | None = None
    description: str | None = None
    end_date: date | None = None
    active: bool | None = None

class RecurringExpenseResponse(BaseModel):
    id: UUID
    budget_category: str
    amount: float
    frequency: str
    vendor: str | None
    description: str | None
    start_date: date
    end_date: date | None
    active: bool
    last_generated: date | None
    monthly_projection: float
    created_at: str

def _recurring_response(r: RecurringExpense) -> RecurringExpenseResponse:
    mult = FREQ_TO_MONTHLY.get(r.frequency, 1.0)
    return RecurringExpenseResponse(
        id=r.id, budget_category=r.budget_category, amount=float(r.amount),
        frequency=r.frequency, vendor=r.vendor, description=r.description,
        start_date=r.start_date, end_date=r.end_date, active=r.active,
        last_generated=r.last_generated, monthly_projection=round(float(r.amount) * mult, 2),
        created_at=r.created_at.isoformat(),
    )

@router.get("/recurring", response_model=list[RecurringExpenseResponse], dependencies=[require_role("ADMIN", "OPERATOR", "VIEWER")])
def list_recurring(db: Session = Depends(get_db)):
    recs = db.query(RecurringExpense).filter(RecurringExpense.deleted_at.is_(None)).order_by(RecurringExpense.budget_category).all()
    return [_recurring_response(r) for r in recs]

@router.post("/recurring", response_model=RecurringExpenseResponse, status_code=201, dependencies=[require_role("ADMIN")])
def create_recurring(body: RecurringExpenseCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    if body.frequency not in FREQUENCIES:
        raise HTTPException(400, "frequency must be one of: " + ", ".join(FREQUENCIES))
    rec = RecurringExpense(created_by=user_id, **body.model_dump())
    db.add(rec)
    db.flush()
    audit(db, "recurring_expenses", rec.id, "CREATE", user_id, snapshot({
        "budget_category": body.budget_category, "amount": float(body.amount),
        "frequency": body.frequency, "vendor": body.vendor,
    }))
    db.commit()
    db.refresh(rec)
    return _recurring_response(rec)

@router.put("/recurring/{rec_id}", response_model=RecurringExpenseResponse, dependencies=[require_role("ADMIN")])
def update_recurring(rec_id: UUID, body: RecurringExpenseUpdate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    rec = db.get(RecurringExpense, rec_id)
    if rec is None or rec.deleted_at is not None:
        raise HTTPException(404, "Recurring expense not found")
    if body.frequency and body.frequency not in FREQUENCIES:
        raise HTTPException(400, "frequency must be one of: " + ", ".join(FREQUENCIES))
    old = {"amount": float(rec.amount), "frequency": rec.frequency, "active": rec.active}
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(rec, field, value)
    new = {"amount": float(rec.amount), "frequency": rec.frequency, "active": rec.active}
    changes = diff(old, new)
    if changes:
        audit(db, "recurring_expenses", rec.id, "UPDATE", user_id, changes)
    db.commit()
    db.refresh(rec)
    return _recurring_response(rec)

@router.delete("/recurring/{rec_id}", status_code=204, dependencies=[require_role("ADMIN")])
def delete_recurring(rec_id: UUID, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    rec = db.get(RecurringExpense, rec_id)
    if rec is None or rec.deleted_at is not None:
        raise HTTPException(404, "Recurring expense not found")
    rec.deleted_at = datetime.now(timezone.utc)
    rec.deleted_by = user_id
    audit(db, "recurring_expenses", rec.id, "DELETE", user_id, snapshot({
        "budget_category": rec.budget_category, "amount": float(rec.amount), "frequency": rec.frequency,
    }))
    db.commit()

@router.post("/recurring/generate", dependencies=[require_role("ADMIN")])
def force_generate(db: Session = Depends(get_db), month: str = Query(default=None)):
    if not month:
        month = date.today().strftime("%Y-%m")
    count = generate_recurring_for_month(db, month)
    return {"generated": count, "month": month}


# ── Auto-generation helper ────────────────────────────────────────────────────

def _add_months(d: date, months: int) -> date:
    """Add months to a date, clamping day to valid range."""
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    from calendar import monthrange
    day = min(d.day, monthrange(y, m)[1])
    return date(y, m, day)

def generate_recurring_for_month(db: Session, month: str) -> int:
    from calendar import monthrange
    from datetime import timedelta
    year, mon = map(int, month.split("-"))
    last_day = date(year, mon, monthrange(year, mon)[1])
    first_day = date(year, mon, 1)
    recs = db.query(RecurringExpense).filter(
        RecurringExpense.active.is_(True), RecurringExpense.deleted_at.is_(None),
        RecurringExpense.start_date <= last_day,
    ).all()
    count = 0
    for rec in recs:
        current = rec.start_date
        end = rec.end_date if rec.end_date and rec.end_date < last_day else last_day
        generated_any = False
        while current <= end:
            if current >= first_day and (rec.last_generated is None or current > rec.last_generated):
                db.add(BusinessExpense(
                    date=current, budget_category=rec.budget_category, amount=rec.amount,
                    vendor=rec.vendor, description="[auto] " + (rec.description or rec.vendor or rec.budget_category),
                    created_by=rec.created_by,
                ))
                count += 1
                generated_any = True
            # Advance by frequency
            if rec.frequency == "weekly":
                current = current + timedelta(weeks=1)
            elif rec.frequency == "biweekly":
                current = current + timedelta(weeks=2)
            elif rec.frequency == "monthly":
                current = _add_months(current, 1)
            elif rec.frequency == "quarterly":
                current = _add_months(current, 3)
            elif rec.frequency == "annual":
                current = _add_months(current, 12)
            else:
                break
        if generated_any:
            rec.last_generated = last_day
    if count > 0:
        db.commit()
    return count


# ── Projection helpers (used by reports) ──────────────────────────────────────

def get_projected_monthly_cost(db: Session) -> float:
    recs = db.query(RecurringExpense).filter(
        RecurringExpense.active.is_(True), RecurringExpense.deleted_at.is_(None)).all()
    return round(sum(float(r.amount) * FREQ_TO_MONTHLY.get(r.frequency, 1.0) for r in recs), 2)

def get_projected_weekly_vehicle_cost(db: Session) -> float:
    recs = db.query(RecurringExpense).filter(
        RecurringExpense.active.is_(True), RecurringExpense.deleted_at.is_(None),
        RecurringExpense.budget_category == "vehicle_rental").all()
    total = 0.0
    for r in recs:
        if r.frequency == "weekly": total += float(r.amount)
        elif r.frequency == "biweekly": total += float(r.amount) / 2
        elif r.frequency == "monthly": total += float(r.amount) / 4.3
    return round(total, 2)
