import { useEffect, useState } from 'react';
import { format, addMonths, subMonths } from 'date-fns';
import { Plus, Check, X, Trash2, ChevronLeft, ChevronRight, Copy, AlertCircle, RefreshCw, Link2, Pencil, List, Eye } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';

function monthStr(d) { return format(d, 'yyyy-MM'); }
function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }

export default function BudgetsPage() {
  const [view, setView] = useState('month');
  const [month, setMonth] = useState(new Date());
  const [items, setItems] = useState([]);
  const [budgetList, setBudgetList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState('pick');
  const [pickExpId, setPickExpId] = useState('');
  const [newForm, setNewForm] = useState({ date: todayStr(), budget_category: '', amount: '', vendor: '', description: '' });
  const [error, setError] = useState('');

  const ms = monthStr(month);
  const catLabel = (name) => categories.find((c) => c.name === name)?.label || name;

  async function loadMonth() {
    const [y, mo] = ms.split('-').map(Number);
    const from = `${ms}-01`;
    const to = format(new Date(y, mo, 0), 'yyyy-MM-dd');
    const [iRes, cRes, eRes] = await Promise.all([
      api.get(`/metrics/expenses/budget-items?month=${ms}`),
      api.get('/metrics/expenses/budget-categories'),
      api.get(`/metrics/expenses?from=${from}&to=${to}&limit=500`),
    ]);
    if (iRes.ok) setItems(await iRes.json());
    if (cRes.ok) {
      const cats = await cRes.json();
      setCategories(cats);
      setNewForm((f) => f.budget_category ? f : { ...f, budget_category: cats[0]?.name || '' });
    }
    if (eRes.ok) setExpenses(await eRes.json());
  }

  async function loadBudgetList() {
    const r = await api.get('/metrics/expenses/budget-items/months?detail=true');
    if (r.ok) setBudgetList(await r.json());
  }

  useEffect(() => {
    if (view === 'month') loadMonth();
    else loadBudgetList();
  }, [ms, view]);

  const unlinkedExpenses = expenses.filter((e) => !e.is_credit);

  function startEdit(i) {
    setEditing(i.id);
    setEditForm({ name: i.name, budget_category: i.budget_category, planned_amount: i.planned_amount, expected_date: i.expected_date || '', month: i.month });
  }

  async function handleSaveEdit(id) {
    setError('');
    const r = await api.put(`/metrics/expenses/budget-items/${id}`, {
      name: editForm.name, budget_category: editForm.budget_category,
      planned_amount: Number(editForm.planned_amount),
      expected_date: editForm.expected_date || null, month: editForm.month,
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Update failed'); return; }
    setEditing(null); loadMonth();
  }

  async function handlePickExpense() {
    if (!pickExpId) return;
    setError('');
    const exp = expenses.find((e) => e.id === pickExpId);
    if (!exp) return;
    const r = await api.post('/metrics/expenses/budget-items', {
      month: ms, name: exp.vendor || exp.description || catLabel(exp.budget_category),
      budget_category: exp.budget_category, planned_amount: exp.amount, expected_date: exp.date || null,
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    const bi = await r.json();
    await api.put(`/metrics/expenses/${exp.id}`, { budget_item_id: bi.id });
    setPickExpId(''); setShowAdd(false); loadMonth();
  }

  async function handleCreateNew() {
    if (!newForm.budget_category || !newForm.amount) return;
    setError('');
    const expR = await api.post('/metrics/expenses', {
      date: newForm.date, budget_category: newForm.budget_category,
      amount: Number(newForm.amount), vendor: newForm.vendor || null, description: newForm.description || null,
    });
    if (!expR.ok) { const d = await expR.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    const exp = await expR.json();
    const biR = await api.post('/metrics/expenses/budget-items', {
      month: ms, name: newForm.vendor || newForm.description || catLabel(newForm.budget_category),
      budget_category: newForm.budget_category, planned_amount: Number(newForm.amount), expected_date: newForm.date || null,
    });
    if (biR.ok) { const bi = await biR.json(); await api.put(`/metrics/expenses/${exp.id}`, { budget_item_id: bi.id }); }
    setNewForm({ date: todayStr(), budget_category: categories[0]?.name || '', amount: '', vendor: '', description: '' });
    setShowAdd(false); loadMonth();
  }

  async function handleDeleteItem(id) {
    if (!window.confirm('Delete this budget item and its linked expense?')) return;
    await api.delete(`/metrics/expenses/budget-items/${id}`);
    loadMonth();
  }

  async function handlePopulate() {
    setError('');
    const r = await api.post(`/metrics/expenses/budget-items/populate?month=${ms}`);
    if (r.ok) { const d = await r.json(); if (d.populated === 0) setError('No new recurring expenses to add.'); }
    loadMonth();
  }

  async function handleCopy() {
    setError('');
    const nextMs = monthStr(addMonths(month, 1));
    const r = await api.post(`/metrics/expenses/budget-items/copy?from=${ms}&to=${nextMs}`);
    if (r.ok) setMonth(addMonths(month, 1));
    else { const d = await r.json().catch(() => ({})); setError(d.detail || 'Copy failed'); }
  }

  async function handleDeleteBudget(m) {
    if (!window.confirm(`Permanently delete the entire ${m} budget and all linked expenses?`)) return;
    await api.delete(`/metrics/expenses/budget-items/month/${m}`);
    loadBudgetList();
  }

  const totalPlanned = items.reduce((s, i) => s + i.planned_amount, 0);
  const totalActual = items.reduce((s, i) => s + i.actual_amount, 0);
  const totalVariance = totalActual - totalPlanned;
  const monthsList = budgetList.filter((b) => b.item_count > 0).map((b) => b.month);
  const hasNextMonth = monthsList.includes(monthStr(addMonths(month, 1)));

  // ── MANAGE VIEW ──
  if (view === 'manage') return (
    <div className="max-w-3xl xl:max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-100">All Budgets</h2>
        <button onClick={() => setView('month')}
          className="text-[10px] px-2 py-1 rounded border border-obsidian-600 text-ink-400 hover:text-ink-200 transition-colors flex items-center gap-1">
          <ChevronLeft size={10} /> Back to Month
        </button>
      </div>

      {budgetList.length === 0 && (
        <div className="metal-card px-6 py-8 text-center">
          <p className="text-ink-400 text-sm">No budgets created yet.</p>
        </div>
      )}

      {budgetList.length > 0 && (
        <div className="metal-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Budget</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Items</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Total Planned</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {budgetList.map((b) => (
                <tr key={b.month} className="border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-ink-100 font-medium">{b.month}</p>
                    <p className="text-[9px] text-ink-500">
                      {(() => { const [y, m] = b.month.split('-'); return format(new Date(Number(y), Number(m) - 1), 'MMMM yyyy'); })()}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-ink-300">{b.item_count}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-300">{formatCurrency(b.total_planned)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setView('month'); const [y, m] = b.month.split('-'); setMonth(new Date(Number(y), Number(m) - 1)); }}
                        className="text-ink-400 hover:text-ink-50 p-0.5" title="View items"><Eye size={12} /></button>
                      <button onClick={() => handleDeleteBudget(b.month)} className="text-ink-400 hover:text-error p-0.5" title="Delete budget">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── MONTH VIEW ──
  return (
    <div className="max-w-3xl xl:max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setMonth(subMonths(month, 1))} className="p-1.5 rounded text-ink-400 hover:text-ink-50 hover:bg-obsidian-700 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-ink-100 min-w-32 text-center">{format(month, 'MMMM yyyy')}</h2>
          <button onClick={() => setMonth(addMonths(month, 1))} className="p-1.5 rounded text-ink-400 hover:text-ink-50 hover:bg-obsidian-700 transition-colors">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => { setView('manage'); loadBudgetList(); }}
            className="text-[10px] px-2 py-1 rounded border border-obsidian-600 text-ink-400 hover:text-ink-200 transition-colors flex items-center gap-1">
            <List size={10} /> Manage Budgets
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePopulate} className="btn-ghost text-xs gap-1.5"><RefreshCw size={12} /> From Recurring</button>
          {!hasNextMonth && items.length > 0 && (
            <button onClick={handleCopy} className="btn-ghost text-xs gap-1.5"><Copy size={12} /> Copy to {format(addMonths(month, 1), 'MMM')}</button>
          )}
          <button onClick={() => { setShowAdd(true); setAddMode('pick'); }} className="btn-primary text-xs gap-1.5"><Plus size={12} /> Add Item</button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs"><AlertCircle size={12} /> {error}</div>}

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="metal-card px-3 py-2.5">
            <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide">Planned</p>
            <p className="text-base font-normal font-mono text-ink-300">{formatCurrency(totalPlanned)}</p>
          </div>
          <div className="metal-card px-3 py-2.5">
            <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide">Actual</p>
            <p className="text-base font-normal font-mono text-ink-300">{formatCurrency(totalActual)}</p>
          </div>
          <div className="metal-card px-3 py-2.5">
            <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide">Variance</p>
            <p className={`text-base font-normal font-mono ${totalVariance <= 0 ? 'text-success' : 'text-error'}`}>
              {totalVariance <= 0 ? '-' : '+'}{formatCurrency(Math.abs(totalVariance))}
            </p>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="metal-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-ink-100">Add to Budget</h3>
            <div className="flex gap-1">
              <button onClick={() => setAddMode('pick')}
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${addMode === 'pick' ? 'border-arc/40 bg-arc/10 text-arc' : 'border-obsidian-600 text-ink-400'}`}>
                Existing Expense
              </button>
              <button onClick={() => setAddMode('new')}
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${addMode === 'new' ? 'border-arc/40 bg-arc/10 text-arc' : 'border-obsidian-600 text-ink-400'}`}>
                New Expense
              </button>
            </div>
          </div>
          {addMode === 'pick' && (
            unlinkedExpenses.length === 0
              ? <p className="text-xs text-ink-500">No expenses for {format(month, 'MMMM yyyy')}. Switch to "New Expense".</p>
              : <div className="space-y-2">
                  <select className="arc-input text-sm font-light w-full" value={pickExpId} onChange={(e) => setPickExpId(e.target.value)}>
                    <option value="">Select an expense...</option>
                    {unlinkedExpenses.map((e) => (
                      <option key={e.id} value={e.id}>{formatDate(e.date)} — {e.vendor || e.description || catLabel(e.budget_category)} — {formatCurrency(e.amount)}</option>
                    ))}
                  </select>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs">Cancel</button>
                    <button onClick={handlePickExpense} disabled={!pickExpId} className="btn-primary text-xs">Link to Budget</button>
                  </div>
                </div>
          )}
          {addMode === 'new' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Date</label>
                  <input type="date" required className="arc-input text-sm font-light" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Category</label>
                  <select className="arc-input text-sm font-light" value={newForm.budget_category} onChange={(e) => setNewForm({ ...newForm, budget_category: e.target.value })}>
                    {categories.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Amount</label>
                  <input type="number" step="0.01" min="0" required className="arc-input text-sm font-light font-mono" placeholder="$0.00" value={newForm.amount} onChange={(e) => setNewForm({ ...newForm, amount: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Vendor</label>
                  <input type="text" maxLength={128} className="arc-input text-sm font-light" placeholder="AutoZone, Costco…" value={newForm.vendor} onChange={(e) => setNewForm({ ...newForm, vendor: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Description</label>
                  <input type="text" maxLength={256} className="arc-input text-sm font-light" placeholder="What is this for?" value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs">Cancel</button>
                <button onClick={handleCreateNew} className="btn-primary text-xs">Create & Add</button>
              </div>
            </div>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="metal-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Date</th>
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Expense</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Planned</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Actual</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Variance</th>
                <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Tax</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const isEditing = editing === i.id;
                const over = i.variance > 0;
                return (
                  <tr key={i.id} className="border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors">
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input type="date" className="arc-input text-xs font-light py-1 w-28"
                          value={editForm.expected_date} onChange={(e) => setEditForm({ ...editForm, expected_date: e.target.value })} />
                      ) : (
                        <span className="text-xs font-mono text-ink-400 whitespace-nowrap">
                          {i.expected_date ? format(new Date(i.expected_date + 'T00:00'), 'MMM d') : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="space-y-1">
                          <input type="text" className="arc-input text-xs font-light py-1 w-full" placeholder="Name"
                            value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                          <div className="flex gap-2">
                            <select className="arc-input text-[10px] font-light py-1 flex-1" value={editForm.budget_category}
                              onChange={(e) => setEditForm({ ...editForm, budget_category: e.target.value })}>
                              {categories.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
                            </select>
                            <select className="arc-input text-[10px] font-light py-1 w-24" value={editForm.month}
                              onChange={(e) => setEditForm({ ...editForm, month: e.target.value })}>
                              {Array.from({ length: 6 }, (_, idx) => {
                                const d = addMonths(new Date(month.getFullYear(), 0, 1), month.getMonth() + idx - 2);
                                const val = monthStr(d);
                                return <option key={val} value={val}>{format(d, 'MMM yy')}</option>;
                              })}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-ink-100 font-medium">{i.name}</span>
                            {i.recurring_expense_id && <Link2 size={10} className="text-arc shrink-0" title="From recurring" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-arc/10 text-arc border border-arc/20 uppercase">{i.category_label}</span>
                            {i.frequency_note && <span className="text-[9px] text-ink-500">{i.frequency_note}</span>}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input type="number" step="0.01" min="0" className="arc-input text-xs font-light font-mono py-1 w-20 text-right"
                          value={editForm.planned_amount} onChange={(e) => setEditForm({ ...editForm, planned_amount: e.target.value })} />
                      ) : (
                        <span className="font-normal font-mono text-ink-300">{formatCurrency(i.planned_amount)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-normal font-mono text-ink-300">{formatCurrency(i.actual_amount)}</td>
                    <td className={`px-4 py-3 text-right font-normal font-mono ${over ? 'text-error' : i.variance < 0 ? 'text-success' : 'text-ink-400'}`}>
                      {i.variance <= 0 ? '-' : '+'}{formatCurrency(Math.abs(i.variance))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {i.tax_deductible
                        ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30">YES</span>
                        : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-obsidian-700 text-ink-500">NO</span>}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={() => handleSaveEdit(i.id)} className="text-arc hover:text-ink-50 p-0.5"><Check size={12} /></button>
                            <button onClick={() => setEditing(null)} className="text-ink-400 hover:text-ink-50 p-0.5"><X size={12} /></button>
                          </>
                        ) : (
                          <button onClick={() => startEdit(i)} className="text-ink-400 hover:text-ink-50 p-0.5" title="Edit"><Pencil size={12} /></button>
                        )}
                        <button onClick={() => handleDeleteItem(i.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors" title="Delete"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {items.length === 0 && (
        <div className="metal-card px-6 py-8 text-center space-y-3">
          <p className="text-ink-300 text-sm">No budget for {format(month, 'MMMM yyyy')}.</p>
          <div className="flex gap-2 justify-center">
            <button onClick={handlePopulate} className="btn-primary text-xs gap-1.5"><RefreshCw size={12} /> Populate from Recurring</button>
            <button onClick={() => { setShowAdd(true); setAddMode('pick'); }} className="btn-ghost text-xs gap-1.5"><Plus size={12} /> Add Expense</button>
          </div>
        </div>
      )}
    </div>
  );
}
