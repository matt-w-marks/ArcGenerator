import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Plus, Trash2, AlertCircle, Upload, Receipt, ChevronDown, ChevronUp, Image,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';

const BUDGET_LABELS = {
  fuel: 'Fuel', vehicle_maintenance: 'Vehicle Maintenance', vehicle_supplies: 'Vehicle Supplies',
  vehicle_rental: 'Vehicle Rental', insurance: 'Insurance', tolls_parking: 'Tolls & Parking',
  food_meals: 'Food & Meals', technology: 'Technology', licensing: 'Licensing',
  professional_services: 'Professional Services', other: 'Other',
};

const BUDGET_CATS = Object.keys(BUDGET_LABELS);

function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }
function thisMonth() { return format(new Date(), 'yyyy-MM'); }

// ── Budget overview cards ────────────────────────────────────────────────────

function BudgetOverview({ summary, onUpdateBudget }) {
  const [editing, setEditing] = useState(null);
  const [editAmt, setEditAmt] = useState('');

  if (!summary || summary.length === 0) return null;

  async function handleSave(category) {
    await onUpdateBudget(category, Number(editAmt));
    setEditing(null);
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {summary.map((r) => {
        const pct = r.monthly_amount > 0 ? Math.min(100, Math.round(r.spent / r.monthly_amount * 100)) : 0;
        const over = r.spent > r.monthly_amount && r.monthly_amount > 0;
        const isEditing = editing === r.budget_category;
        return (
          <div key={r.budget_category} className="metal-card px-3 py-2.5">
            <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide mb-1">
              {BUDGET_LABELS[r.budget_category] || r.budget_category}
            </p>
            <div className="flex items-baseline gap-1.5 mb-1.5">
              <span className="text-sm font-normal font-mono text-ink-300">{formatCurrency(r.spent)}</span>
              {isEditing ? (
                <span className="flex items-center gap-1">
                  <span className="text-[9px] text-ink-500">of $</span>
                  <input type="number" step="0.01" min="0" className="arc-input text-[10px] font-light font-mono py-0.5 w-16"
                    value={editAmt} onChange={(e) => setEditAmt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(r.budget_category); if (e.key === 'Escape') setEditing(null); }}
                    autoFocus />
                  <button onClick={() => handleSave(r.budget_category)} className="text-[9px] text-arc hover:text-ink-50">Save</button>
                </span>
              ) : (
                <button onClick={() => { setEditing(r.budget_category); setEditAmt(r.monthly_amount); }}
                  className="text-[9px] text-ink-500 hover:text-ink-200 transition-colors" title="Click to edit budget">
                  of {formatCurrency(r.monthly_amount)}
                </button>
              )}
            </div>
            <div className="w-full h-1.5 rounded-full bg-obsidian-700 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${over ? 'bg-error' : pct >= 80 ? 'bg-ember' : 'bg-arc'}`}
                style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            {over && <p className="text-[9px] text-error mt-0.5">{formatCurrency(r.spent - r.monthly_amount)} over</p>}
            {r.tax_deductible && r.spent > 0 && (
              <p className="text-[9px] text-success mt-0.5" title={r.tax_notes || ''}>
                ~{formatCurrency(r.spent * 0.22)} tax savings
              </p>
            )}
            {!r.tax_deductible && r.spent > 0 && (
              <p className="text-[9px] text-ink-600 mt-0.5" title={r.tax_notes || ''}>Not deductible</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Add expense form ─────────────────────────────────────────────────────────

function AddExpenseForm({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), budget_category: 'vehicle_supplies', amount: '', vendor: '', description: '' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const body = { ...form, amount: Number(form.amount) };
    const r = await api.post('/metrics/expenses', body);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); setSaving(false); return; }
    const exp = await r.json();

    // Upload receipt if selected
    if (file) {
      const fd = new FormData();
      fd.append('file', file);
      await fetch(`/metrics/expenses/${exp.id}/receipt`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('rm_at')}` },
        body: fd,
      });
    }

    setForm({ date: todayStr(), budget_category: 'vehicle_supplies', amount: '', vendor: '', description: '' });
    setFile(null);
    setOpen(false);
    setSaving(false);
    onAdd();
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="btn-primary text-xs gap-1.5">
      <Plus size={12} /> Add Expense
    </button>
  );

  return (
    <div className="metal-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-ink-100">Log Business Expense</h3>
      {error && <p className="text-xs text-error flex items-center gap-1"><AlertCircle size={12} /> {error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Date</label>
            <input type="date" required className="arc-input text-sm font-light"
              value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Category</label>
            <select className="arc-input text-sm font-light" value={form.budget_category}
              onChange={(e) => setForm({ ...form, budget_category: e.target.value })}>
              {BUDGET_CATS.map((c) => <option key={c} value={c}>{BUDGET_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Amount</label>
            <input type="number" step="0.01" min="0" required className="arc-input text-sm font-light font-mono"
              placeholder="$0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Vendor</label>
            <input type="text" maxLength={128} className="arc-input text-sm font-light"
              placeholder="AutoZone, Costco…" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Description</label>
            <input type="text" maxLength={256} className="arc-input text-sm font-light"
              placeholder="What was it for?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Receipt</label>
            <label className="flex items-center gap-2 arc-input text-sm font-light cursor-pointer">
              <Upload size={14} className="text-ink-400" />
              <span className="text-ink-400 truncate">{file ? file.name : 'Upload photo…'}</span>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
            </label>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-xs">
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Expense ledger ───────────────────────────────────────────────────────────

function ExpenseLedger({ expenses, onDelete, onRefresh }) {
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? expenses.filter((e) => e.budget_category === filter)
    : expenses;

  return (
    <div className="metal-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-obsidian-700">
        <h2 className="text-sm font-semibold text-ink-100">Expense Ledger</h2>
        <select className="arc-input text-xs font-light py-1 w-36" value={filter}
          onChange={(e) => setFilter(e.target.value)}>
          <option value="">All categories</option>
          {BUDGET_CATS.map((c) => <option key={c} value={c}>{BUDGET_LABELS[c]}</option>)}
        </select>
      </div>
      <div className="max-h-96 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {filtered.length === 0 && (
          <p className="text-xs text-ink-500 px-4 py-6 text-center">No expenses logged yet.</p>
        )}
        {filtered.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-arc/10 text-arc border border-arc/20 uppercase">
                  {BUDGET_LABELS[e.budget_category]?.slice(0, 10) || e.budget_category}
                </span>
                {e.vendor && <span className="text-xs text-ink-200 truncate">{e.vendor}</span>}
                {e.has_receipt && <Image size={10} className="text-success shrink-0" title="Receipt attached" />}
              </div>
              {e.description && <p className="text-[10px] text-ink-500 truncate mt-0.5">{e.description}</p>}
            </div>
            <span className="text-xs font-normal font-mono text-error shrink-0">{formatCurrency(e.amount)}</span>
            <span className="text-[10px] text-ink-500 font-mono shrink-0">{formatDate(e.date)}</span>
            <button onClick={() => onDelete(e.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors shrink-0">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function FinancesPage() {
  const [summary, setSummary] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const month = thisMonth();
    const [sumRes, expRes] = await Promise.all([
      api.get(`/metrics/expenses/budgets/summary?month=${month}`),
      api.get('/metrics/expenses?limit=200'),
    ]);
    if (sumRes.ok) setSummary(await sumRes.json());
    if (expRes.ok) setExpenses(await expRes.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    if (!window.confirm('Delete this expense?')) return;
    await api.delete(`/metrics/expenses/${id}`);
    load();
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Finances</h1>
          <p className="text-xs text-ink-400 mt-0.5">{format(new Date(), 'MMMM yyyy')} budget overview</p>
        </div>
        <AddExpenseForm onAdd={load} />
      </div>

      {/* Budget overview — click allocation to edit */}
      <BudgetOverview summary={summary} onUpdateBudget={async (cat, amt) => {
        await api.put(`/metrics/expenses/budgets/${cat}`, { monthly_amount: amt });
        load();
      }} />

      {/* Expense ledger */}
      <ExpenseLedger expenses={expenses} onDelete={handleDelete} onRefresh={load} />

      {/* Empty state */}
      {expenses.length === 0 && summary.every((r) => r.spent === 0) && (
        <div className="metal-card px-6 py-8 text-center">
          <Receipt size={24} className="text-ink-500 mx-auto mb-2" />
          <p className="text-ink-400 text-sm">No business expenses logged yet.</p>
          <p className="text-ink-500 text-xs mt-1">Use "Add Expense" to log vehicle supplies, tech costs, licensing, etc.</p>
        </div>
      )}
    </div>
  );
}
