"""Business expense ledger with budget tracking and receipt uploads (DB storage)."""

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import case, func as sqf
from sqlalchemy.orm import Session

from audit import audit, diff, snapshot, get_user_id
from database import get_db
from models import BudgetCategory, BudgetItem, BusinessExpense, DailyBlockLog, RecurringExpense
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
    is_credit: bool = False

class ExpenseUpdate(BaseModel):
    expense_date: date | None = None
    budget_category: str | None = None
    amount: float | None = Field(default=None, ge=0)
    vendor: str | None = None
    description: str | None = None
    notes: str | None = None
    is_credit: bool | None = None
    budget_item_id: UUID | None = None

class ExpenseResponse(BaseModel):
    id: UUID
    date: date
    budget_category: str
    amount: float
    is_credit: bool
    vendor: str | None
    description: str | None
    has_receipt: bool
    recurring_expense_id: UUID | None
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

@router.get("", response_model=list[ExpenseResponse], dependencies=[require_role('ADMIN', 'OPERATOR')])
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

@router.delete("/{expense_id}/permanent", status_code=204, dependencies=[require_role('ADMIN')])
def delete_expense_permanent(expense_id: UUID, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    exp = db.get(BusinessExpense, expense_id)
    if exp is None:
        raise HTTPException(404, "Expense not found")
    if exp.budget_item_id:
        bi = db.get(BudgetItem, exp.budget_item_id)
        if bi:
            audit(db, "budget_items", bi.id, "DELETE", user_id, snapshot({"name": bi.name, "month": bi.month}))
            db.delete(bi)
    audit(db, "business_expenses", exp.id, "DELETE", user_id, snapshot({
        "date": str(exp.date), "budget_category": exp.budget_category, "amount": float(exp.amount), "permanent": True,
    }))
    db.delete(exp)
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

@router.get("/{expense_id}/receipt", dependencies=[require_role('ADMIN', 'OPERATOR')])
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

@router.get("/budget-categories", response_model=list[BudgetCategoryResponse], dependencies=[require_role("ADMIN", "OPERATOR")])
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


# ── Budget Items (planned expense list per month) ─────────────────────────────

def _cat_map(db: Session) -> dict:
    return {c.name: c for c in db.query(BudgetCategory).all()}

class BudgetItemResponse(BaseModel):
    id: UUID
    month: str
    expected_date: date | None
    name: str
    budget_category: str
    category_label: str
    planned_amount: float
    actual_amount: float
    variance: float
    frequency_note: str | None
    recurring_expense_id: UUID | None
    vehicle_id: UUID | None
    tax_deductible: bool
    is_archived: bool
    notes: str | None

def _item_response(item: BudgetItem, actual: float, cm: dict) -> BudgetItemResponse:
    c = cm.get(item.budget_category)
    planned = float(item.planned_amount)
    return BudgetItemResponse(
        id=item.id, month=item.month, expected_date=item.expected_date, name=item.name,
        budget_category=item.budget_category,
        category_label=c.label if c else item.budget_category,
        planned_amount=planned, actual_amount=round(actual, 2),
        variance=round(actual - planned, 2),
        frequency_note=item.frequency_note,
        recurring_expense_id=item.recurring_expense_id,
        vehicle_id=item.vehicle_id,
        tax_deductible=c.tax_deductible if c else False,
        is_archived=item.deleted_at is not None,
        notes=item.notes,
    )

def _actuals_for_month(db: Session, month: str) -> dict:
    """Get actual spending per budget_item_id and per category for a month."""
    from datetime import date as d
    year, mon = map(int, month.split("-"))
    month_start = d(year, mon, 1)
    month_end = d(year, mon + 1, 1) if mon < 12 else d(year + 1, 1, 1)

    # Signed amount: credits subtract, expenses add
    signed_amt = sqf.sum(
        case((BusinessExpense.is_credit.is_(True), -BusinessExpense.amount), else_=BusinessExpense.amount)
    )

    # By budget_item_id (direct link)
    by_item = dict(
        db.query(BusinessExpense.budget_item_id, signed_amt)
        .filter(BusinessExpense.budget_item_id.isnot(None),
                BusinessExpense.date >= month_start, BusinessExpense.date < month_end,
                BusinessExpense.deleted_at.is_(None))
        .group_by(BusinessExpense.budget_item_id).all()
    )

    # By category (for items without direct link)
    by_cat = dict(
        db.query(BusinessExpense.budget_category, signed_amt)
        .filter(BusinessExpense.budget_item_id.is_(None),
                BusinessExpense.date >= month_start, BusinessExpense.date < month_end,
                BusinessExpense.deleted_at.is_(None))
        .group_by(BusinessExpense.budget_category).all()
    )

    return {"by_item": {k: float(v) for k, v in by_item.items()}, "by_cat": {k: float(v) for k, v in by_cat.items()}}

@router.get("/budget-items", response_model=list[BudgetItemResponse], dependencies=[require_role("ADMIN", "OPERATOR")])
def list_budget_items(
    db: Session = Depends(get_db),
    month: str = Query(default=None),
    all_months: bool = Query(default=False),
    include_archived: bool = Query(default=False),
):
    q = db.query(BudgetItem)
    if not include_archived:
        q = q.filter(BudgetItem.deleted_at.is_(None))
    if not all_months:
        if not month:
            month = date.today().strftime("%Y-%m")
        q = q.filter(BudgetItem.month == month)
    items = q.order_by(BudgetItem.month.desc(), BudgetItem.expected_date, BudgetItem.name).all()
    cm = _cat_map(db)
    # Build actuals per month encountered
    actuals_cache = {}
    results = []
    for item in items:
        if item.month not in actuals_cache:
            actuals_cache[item.month] = _actuals_for_month(db, item.month)
        actuals = actuals_cache[item.month]
        if item.recurring_expense_id:
            actual = float(item.planned_amount)
        else:
            actual = actuals["by_item"].get(item.id, 0)
            if actual == 0:
                actual = actuals["by_cat"].get(item.budget_category, 0)
        results.append(_item_response(item, actual, cm))
    return results

class BudgetItemCreate(BaseModel):
    month: str = Field(pattern="^\\d{4}-\\d{2}$")
    expected_date: date | None = None
    name: str = Field(min_length=1, max_length=128)
    budget_category: str
    planned_amount: float = Field(ge=0)
    frequency_note: str | None = None
    recurring_expense_id: UUID | None = None
    vehicle_id: UUID | None = None
    notes: str | None = None

@router.post("/budget-items", response_model=BudgetItemResponse, status_code=201, dependencies=[require_role("ADMIN")])
def create_budget_item(body: BudgetItemCreate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    item = BudgetItem(**body.model_dump())
    db.add(item)
    db.flush()
    audit(db, "budget_items", item.id, "CREATE", user_id, snapshot({
        "name": item.name, "month": item.month, "planned_amount": float(item.planned_amount),
    }))
    db.commit()
    db.refresh(item)
    return _item_response(item, 0, _cat_map(db))

class BudgetItemUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    budget_category: str | None = None
    planned_amount: float | None = Field(default=None, ge=0)
    expected_date: date | None = None
    month: str | None = Field(default=None, pattern="^\\d{4}-\\d{2}$")
    notes: str | None = None

@router.put("/budget-items/{item_id}", response_model=BudgetItemResponse, dependencies=[require_role("ADMIN")])
def update_budget_item(item_id: UUID, body: BudgetItemUpdate, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    item = db.get(BudgetItem, item_id)
    if item is None:
        raise HTTPException(404, "Budget item not found")
    old = {"name": item.name, "planned_amount": float(item.planned_amount), "month": item.month,
           "expected_date": str(item.expected_date) if item.expected_date else None, "budget_category": item.budget_category}
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    new = {"name": item.name, "planned_amount": float(item.planned_amount), "month": item.month,
           "expected_date": str(item.expected_date) if item.expected_date else None, "budget_category": item.budget_category}
    changes = diff(old, new)
    if changes:
        audit(db, "budget_items", item.id, "UPDATE", user_id, changes)
    # Sync linked expense
    linked = db.query(BusinessExpense).filter(BusinessExpense.budget_item_id == item.id).first()
    if linked:
        linked.amount = item.planned_amount
        linked.budget_category = item.budget_category
        linked.vendor = item.name
        if item.expected_date:
            linked.date = item.expected_date
    db.commit()
    db.refresh(item)
    return _item_response(item, 0, _cat_map(db))

@router.delete("/budget-items/{item_id}", status_code=204, dependencies=[require_role("ADMIN")])
def delete_budget_item(item_id: UUID, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    item = db.get(BudgetItem, item_id)
    if item is None:
        raise HTTPException(404, "Budget item not found")
    # Unlink any expenses pointing to this budget item (don't delete them)
    db.query(BusinessExpense).filter(BusinessExpense.budget_item_id == item_id).update({"budget_item_id": None})
    audit(db, "budget_items", item.id, "DELETE", user_id, snapshot({"name": item.name, "month": item.month}))
    db.delete(item)
    db.commit()

@router.post("/budget-items/populate", dependencies=[require_role("ADMIN")])
def populate_from_recurring(db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id), month: str = Query(...)):
    """Auto-populate budget items from active recurring expenses — one item per recurring expense."""
    year, mon = map(int, month.split("-"))
    month_start = date(year, mon, 1)

    recs = db.query(RecurringExpense).filter(
        RecurringExpense.active.is_(True), RecurringExpense.deleted_at.is_(None),
    ).all()

    # Check existing by recurring_expense_id to avoid duplicates
    existing_rec_ids = {i.recurring_expense_id for i in
        db.query(BudgetItem).filter(BudgetItem.month == month, BudgetItem.recurring_expense_id.isnot(None)).all()}
    count = 0
    for rec in recs:
        if rec.id in existing_rec_ids:
            continue
        name = rec.vendor or rec.description or rec.budget_category
        # Create budget item
        bi = BudgetItem(
            month=month, expected_date=month_start, name=name,
            budget_category=rec.budget_category,
            planned_amount=float(rec.amount),
            frequency_note=rec.frequency,
            recurring_expense_id=rec.id, vehicle_id=rec.vehicle_id,
        )
        db.add(bi)
        db.flush()
        # Create matching expense row
        db.add(BusinessExpense(
            date=month_start, budget_category=rec.budget_category,
            amount=float(rec.amount), vendor=rec.vendor,
            description=rec.description, vehicle_id=rec.vehicle_id,
            budget_item_id=bi.id, recurring_expense_id=rec.id,
        ))
        count += 1
    if count > 0:
        db.commit()
    return {"populated": count, "month": month}

@router.post("/budget-items/copy", dependencies=[require_role("ADMIN")])
def copy_budget(db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id),
                from_month: str = Query(..., alias="from"), to_month: str = Query(..., alias="to")):
    source = db.query(BudgetItem).filter(BudgetItem.month == from_month).all()
    if not source:
        raise HTTPException(404, f"No budget items for {from_month}")
    existing = db.query(BudgetItem).filter(BudgetItem.month == to_month).all()
    if existing:
        raise HTTPException(409, f"Budget items already exist for {to_month}")
    for item in source:
        db.add(BudgetItem(
            month=to_month, name=item.name, budget_category=item.budget_category,
            planned_amount=item.planned_amount, frequency_note=item.frequency_note,
            recurring_expense_id=item.recurring_expense_id, vehicle_id=item.vehicle_id,
            notes=item.notes,
        ))
    db.commit()
    return {"copied": len(source), "from_month": from_month, "to_month": to_month}

@router.get("/budget-items/months", dependencies=[require_role("ADMIN", "OPERATOR")])
def list_budget_months(db: Session = Depends(get_db), detail: bool = Query(default=False)):
    if not detail:
        rows = db.query(BudgetItem.month).filter(BudgetItem.deleted_at.is_(None)).distinct().order_by(BudgetItem.month).all()
        return [r[0] for r in rows]
    # Detailed: return per-month summaries
    from sqlalchemy import func as f
    rows = (
        db.query(
            BudgetItem.month,
            f.count(BudgetItem.id).label("item_count"),
            f.sum(BudgetItem.planned_amount).label("total_planned"),
            f.count(BudgetItem.id).filter(BudgetItem.deleted_at.isnot(None)).label("archived_count"),
        )
        .group_by(BudgetItem.month)
        .order_by(BudgetItem.month.desc())
        .all()
    )
    return [
        {"month": r.month, "item_count": r.item_count - r.archived_count,
         "archived_count": r.archived_count,
         "total_planned": round(float(r.total_planned or 0), 2)}
        for r in rows
    ]

@router.delete("/budget-items/month/{month}", status_code=204, dependencies=[require_role("ADMIN")])
def delete_budget_month(month: str, db: Session = Depends(get_db), user_id: UUID | None = Depends(get_user_id)):
    items = db.query(BudgetItem).filter(BudgetItem.month == month).all()
    if not items:
        raise HTTPException(404, f"No budget found for {month}")
    for item in items:
        audit(db, "budget_items", item.id, "DELETE", user_id, snapshot({"name": item.name, "month": item.month}))
        db.delete(item)
    db.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _exp_response(e: BusinessExpense) -> ExpenseResponse:
    return ExpenseResponse(
        id=e.id, date=e.date, budget_category=e.budget_category,
        amount=float(e.amount), is_credit=e.is_credit,
        vendor=e.vendor, description=e.description,
        has_receipt=e.receipt_data is not None,
        recurring_expense_id=e.recurring_expense_id,
        notes=e.notes,
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
    start_date: date | None = None
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
    return RecurringExpenseResponse(
        id=r.id, budget_category=r.budget_category, amount=float(r.amount),
        frequency=r.frequency, vendor=r.vendor, description=r.description,
        start_date=r.start_date, end_date=r.end_date, active=r.active,
        last_generated=r.last_generated, monthly_projection=float(r.amount),
        created_at=r.created_at.isoformat(),
    )

@router.get("/recurring", response_model=list[RecurringExpenseResponse], dependencies=[require_role("ADMIN", "OPERATOR")])
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

def _add_months(d: date, months: int) -> date:
    """Add months to a date, clamping day to valid range."""
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    from calendar import monthrange
    day = min(d.day, monthrange(y, m)[1])
    return date(y, m, day)


# ── Projection helpers (used by reports) ──────────────────────────────────────

def get_projected_monthly_cost(db: Session) -> float:
    """Sum of all active recurring expense amounts at face value. No frequency multipliers."""
    recs = db.query(RecurringExpense).filter(
        RecurringExpense.active.is_(True), RecurringExpense.deleted_at.is_(None)).all()
    return round(sum(float(r.amount) for r in recs), 2)

def get_projected_weekly_vehicle_cost(db: Session) -> float:
    recs = db.query(RecurringExpense).filter(
        RecurringExpense.active.is_(True), RecurringExpense.deleted_at.is_(None),
        RecurringExpense.budget_category == "vehicle_rental").all()
    return round(sum(float(r.amount) for r in recs), 2)


# ── Recurring expense materialization ────────────────────────────────────────

def materialize_recurring_expenses(db: Session) -> int:
    """Create BusinessExpense rows for all due recurring expenses up to today.
    Returns count of new rows created. Safe to call multiple times (dedup by recurring_expense_id + date)."""
    from datetime import timedelta
    today = date.today()

    recs = db.query(RecurringExpense).filter(
        RecurringExpense.active.is_(True), RecurringExpense.deleted_at.is_(None)
    ).all()

    # Build set of existing (recurring_expense_id, date) pairs for dedup — include deleted to avoid re-creating
    existing = set(
        db.query(BusinessExpense.recurring_expense_id, BusinessExpense.date)
        .filter(BusinessExpense.recurring_expense_id.isnot(None))
        .all()
    )

    count = 0
    for rec in recs:
        cursor = rec.start_date
        end = rec.end_date if rec.end_date and rec.end_date < today else today

        while cursor <= end:
            if (rec.id, cursor) not in existing:
                db.add(BusinessExpense(
                    date=cursor, budget_category=rec.budget_category,
                    amount=float(rec.amount), vendor=rec.vendor,
                    description=rec.description, vehicle_id=rec.vehicle_id,
                    recurring_expense_id=rec.id,
                ))
                existing.add((rec.id, cursor))
                count += 1

            # Advance by frequency
            if rec.frequency == "weekly":
                cursor += timedelta(weeks=1)
            elif rec.frequency == "biweekly":
                cursor += timedelta(weeks=2)
            elif rec.frequency == "monthly":
                cursor = _add_months(cursor, 1)
            elif rec.frequency == "quarterly":
                cursor = _add_months(cursor, 3)
            elif rec.frequency == "annual":
                cursor = _add_months(cursor, 12)
            else:
                break

        rec.last_generated = today

    if count > 0:
        db.commit()
    return count


@router.post("/recurring/skip-occurrence", status_code=204, dependencies=[require_role("ADMIN")])
def skip_recurring_occurrence(
    recurring_expense_id: UUID = Query(...),
    occurrence_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
    user_id: UUID | None = Depends(get_user_id),
):
    """Create a soft-deleted expense row for this occurrence so it won't be materialized."""
    existing = db.query(BusinessExpense).filter(
        BusinessExpense.recurring_expense_id == recurring_expense_id,
        BusinessExpense.date == occurrence_date,
    ).first()
    if existing:
        # Already exists — just soft delete it
        existing.deleted_at = datetime.now(timezone.utc)
        existing.deleted_by = user_id
    else:
        rec = db.get(RecurringExpense, recurring_expense_id)
        if rec is None:
            raise HTTPException(404, "Recurring expense not found")
        exp = BusinessExpense(
            date=occurrence_date, budget_category=rec.budget_category,
            amount=float(rec.amount), vendor=rec.vendor, description=rec.description,
            vehicle_id=rec.vehicle_id, recurring_expense_id=rec.id,
            deleted_at=datetime.now(timezone.utc), deleted_by=user_id,
        )
        db.add(exp)
    audit(db, "business_expenses", recurring_expense_id, "DELETE", user_id,
          snapshot({"recurring_expense_id": str(recurring_expense_id), "date": str(occurrence_date), "skipped": True}))
    db.commit()

@router.post("/recurring/materialize", dependencies=[require_role("ADMIN")])
def materialize_endpoint(db: Session = Depends(get_db)):
    count = materialize_recurring_expenses(db)
    return {"created": count}
