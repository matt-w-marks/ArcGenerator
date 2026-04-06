import { useEffect, useState, useCallback } from 'react';
import { format, addMonths, subMonths } from 'date-fns';
import {
  Plus, Trash2, AlertCircle, Upload, Image, Pencil, Check, X,
  ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';
import BudgetsPage from './BudgetsPage';
import RecurringPage from './RecurringPage';

function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }
function thisMonth() { return format(new Date(), 'yyyy-MM'); }

// ── Add expense form ─────────────────────────────────────────────────────────

function AddExpenseForm({ onAdd, categories }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), budget_category: '', amount: '', vendor: '', description: '', is_credit: false });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const body = { ...form, amount: Number(form.amount), is_credit: form.is_credit };
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

    setForm({ date: todayStr(), budget_category: categories[0]?.name || '', amount: '', vendor: '', description: '', is_credit: false });
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
              {categories.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
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
        <div className="flex items-center gap-2 mt-1">
          <input type="checkbox" id="is-credit" className="accent-arc"
            checked={form.is_credit} onChange={(e) => setForm({ ...form, is_credit: e.target.checked })} />
          <label htmlFor="is-credit" className="text-xs text-ink-300">This is a refund or credit (reduces expenses)</label>
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


// ── Main page ────────────────────────────────────────────────────────────────

function monthStr(d) { return format(d, 'yyyy-MM'); }

export default function FinancesPage() {
  const [tab, setTab] = useState('ledger');
  const [month, setMonth] = useState(new Date());
  const [expenses, setExpenses] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editingExp, setEditingExp] = useState(null);
  const [editExpForm, setEditExpForm] = useState({});

  const ms = monthStr(month);
  const catLabel = (name) => categories.find((c) => c.name === name)?.label || name;

  const load = useCallback(async () => {
    const m = monthStr(month);
    const [y, mo] = m.split('-').map(Number);
    const from = `${m}-01`;
    const toDate = new Date(y, mo, 0);
    const to = format(toDate, 'yyyy-MM-dd');
    const [expRes, recRes, catRes] = await Promise.all([
      api.get(`/metrics/expenses?from=${from}&to=${to}&limit=500`),
      api.get('/metrics/expenses/recurring'),
      api.get('/metrics/expenses/budget-categories'),
    ]);
    if (expRes.ok) setExpenses(await expRes.json());
    if (recRes.ok) setRecurring(await recRes.json());
    if (catRes.ok) setCategories(await catRes.json());
  }, [month]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    if (!window.confirm('Delete this expense?')) return;
    await api.delete(`/metrics/expenses/${id}`);
    load();
  }

  async function handleMakeRecurring(e) {
    const freq = window.prompt('Frequency? (weekly, biweekly, monthly, quarterly, annual)', 'monthly');
    if (!freq) return;
    const r = await api.post('/metrics/expenses/recurring', {
      budget_category: e.budget_category, amount: e.amount,
      frequency: freq, vendor: e.vendor || null,
      description: e.description || null, start_date: e.date,
    });
    if (r.ok) load();
  }

  async function handleHardDelete(id) {
    if (!window.confirm('Permanently delete this expense? This cannot be undone.')) return;
    await api.delete(`/metrics/expenses/${id}/permanent`);
    load();
  }


  async function handleSaveExpEdit(id) {
    await api.put(`/metrics/expenses/${id}`, {
      expense_date: editExpForm.date || undefined,
      amount: Number(editExpForm.amount),
      vendor: editExpForm.vendor || null,
      description: editExpForm.description || null,
    });
    setEditingExp(null);
    load();
  }

  return (
    <div className="max-w-3xl xl:max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Finances</h1>
          <p className="text-xs text-ink-400 mt-0.5">{format(month, 'MMMM yyyy')}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-obsidian-700">
        {[['ledger', 'Ledger'], ['budgets', 'Budgets'], ['expenses', 'Expenses']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => { setTab(id); load(); }}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === id ? 'border-arc text-arc' : 'border-transparent text-ink-400 hover:text-ink-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Expenses — recurring section + one-time section */}
      {tab === 'expenses' && (
        <>
          <RecurringPage />

          {/* One-time expenses */}
          <div className="flex items-center justify-between mt-6">
            <div>
              <h2 className="text-sm font-semibold text-ink-100">One-Time Expenses</h2>
              <p className="text-xs text-ink-500 mt-0.5">Individual purchases not on a recurring schedule.</p>
            </div>
            <AddExpenseForm onAdd={load} categories={categories} />
          </div>

          {/* One-time expense list */}
          <div className="metal-card overflow-hidden">
            <div className="max-h-80 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {expenses.filter((e) => !e.recurring_expense_id).length === 0 && (
                <p className="text-xs text-ink-500 px-4 py-6 text-center">No one-time expenses logged yet.</p>
              )}
              {expenses.filter((e) => !e.recurring_expense_id).map((e) => {
                const isEditing = editingExp === e.id;
                return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors">
                  {isEditing ? (
                    <>
                      <div className="flex-1 min-w-0 space-y-1">
                        <input type="text" className="arc-input text-xs font-light py-1 w-full" placeholder="Vendor"
                          value={editExpForm.vendor} onChange={(ev) => setEditExpForm({ ...editExpForm, vendor: ev.target.value })} />
                        <input type="text" className="arc-input text-xs font-light py-1 w-full" placeholder="Description"
                          value={editExpForm.description} onChange={(ev) => setEditExpForm({ ...editExpForm, description: ev.target.value })} />
                      </div>
                      <input type="number" step="0.01" min="0" className="arc-input text-xs font-light font-mono py-1 w-20 text-right"
                        value={editExpForm.amount} onChange={(ev) => setEditExpForm({ ...editExpForm, amount: ev.target.value })} />
                      <input type="date" className="arc-input text-xs font-light py-1 w-28"
                        value={editExpForm.date} onChange={(ev) => setEditExpForm({ ...editExpForm, date: ev.target.value })} />
                      <button onClick={() => handleSaveExpEdit(e.id)} className="text-arc hover:text-ink-50 p-0.5"><Check size={12} /></button>
                      <button onClick={() => setEditingExp(null)} className="text-ink-400 hover:text-ink-50 p-0.5"><X size={12} /></button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-arc/10 text-arc border border-arc/20 uppercase">
                            {catLabel(e.budget_category) || e.budget_category}
                          </span>
                          {e.vendor && <span className="text-xs text-ink-200 truncate">{e.vendor}</span>}
                          {e.has_receipt && <Image size={10} className="text-success shrink-0" title="Receipt attached" />}
                        </div>
                        {e.description && <p className="text-[10px] text-ink-500 truncate mt-0.5">{e.description}</p>}
                      </div>
                      <span className={`text-xs font-normal font-mono shrink-0 ${e.is_credit ? 'text-success' : 'text-error'}`}>
                        {e.is_credit ? '+' : '-'}{formatCurrency(e.amount)}
                      </span>
                      <span className="text-[10px] text-ink-500 font-mono shrink-0">{formatDate(e.date)}</span>
                      <button onClick={() => handleMakeRecurring(e)} className="text-ink-400 hover:text-arc p-0.5" title="Make recurring">
                        <RefreshCw size={12} />
                      </button>
                      <button onClick={() => {
                        setEditingExp(e.id);
                        setEditExpForm({ amount: e.amount, vendor: e.vendor || '', description: e.description || '', date: e.date });
                      }} className="text-ink-400 hover:text-ink-50 p-0.5"><Pencil size={12} /></button>
                    </>
                  )}
                  <button onClick={() => handleDelete(e.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Budgets — monthly allocations */}
      {/* Ledger — real expense rows only */}
      {tab === 'ledger' && (() => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
        const paid = sorted.filter((e) => e.date <= todayStr);
        const future = sorted.filter((e) => e.date > todayStr);
        const actualSpent = paid.filter((e) => !e.is_credit).reduce((s, e) => s + e.amount, 0);
        const actualCredits = paid.filter((e) => e.is_credit).reduce((s, e) => s + e.amount, 0);
        const estimatedSpent = future.filter((e) => !e.is_credit).reduce((s, e) => s + e.amount, 0);

        return (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setMonth(subMonths(month, 1))} className="p-1.5 rounded text-ink-400 hover:text-ink-50 hover:bg-obsidian-700 transition-colors">
                <ChevronLeft size={16} />
              </button>
              <h2 className="text-sm font-semibold text-ink-100 min-w-32 text-center">{format(month, 'MMMM yyyy')}</h2>
              <button onClick={() => setMonth(addMonths(month, 1))} className="p-1.5 rounded text-ink-400 hover:text-ink-50 hover:bg-obsidian-700 transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="metal-card px-3 py-2.5">
              <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide">Actual</p>
              <p className="text-base font-normal font-mono text-error">-{formatCurrency(actualSpent - actualCredits)}</p>
              <p className="text-[9px] text-ink-500">{paid.length} paid</p>
            </div>
            <div className="metal-card px-3 py-2.5">
              <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide">Estimated</p>
              <p className="text-base font-normal font-mono text-ember">-{formatCurrency(estimatedSpent)}</p>
              <p className="text-[9px] text-ink-500">{future.length} upcoming</p>
            </div>
            <div className="metal-card px-3 py-2.5">
              <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide">Total</p>
              <p className="text-base font-normal font-mono text-ink-300">-{formatCurrency(actualSpent - actualCredits + estimatedSpent)}</p>
              <p className="text-[9px] text-ink-500">{sorted.length} entries</p>
            </div>
          </div>

          <div className="metal-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-obsidian-600">
                  <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Date</th>
                  <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Expense</th>
                  <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Amount</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => {
                  const isFuture = e.date > todayStr;
                  return (
                  <tr key={e.id} className={`border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors ${isFuture ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 text-xs font-mono text-ink-400 whitespace-nowrap">
                      {format(new Date(e.date + 'T00:00'), 'MMM d')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-arc/10 text-arc border border-arc/20 uppercase">
                          {catLabel(e.budget_category) || e.budget_category}
                        </span>
                        {e.vendor && <span className="text-xs text-ink-200 truncate">{e.vendor}</span>}
                        {e.has_receipt && <Image size={10} className="text-success shrink-0" title="Receipt attached" />}
                      </div>
                      {e.description && <p className="text-[10px] text-ink-500 truncate mt-0.5">{e.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-normal font-mono ${e.is_credit ? 'text-success' : 'text-error'}`}>
                        {e.is_credit ? '+' : '-'}{formatCurrency(e.amount)}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <button onClick={() => handleHardDelete(e.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors" title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <p className="text-xs text-ink-500 px-4 py-6 text-center">No expenses for {format(month, 'MMMM yyyy')}.</p>
            )}
          </div>
        </>
        );
      })()}

      {tab === 'budgets' && <BudgetsPage />}
    </div>
  );
}
