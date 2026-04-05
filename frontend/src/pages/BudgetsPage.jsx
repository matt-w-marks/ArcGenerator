import { useEffect, useState } from 'react';
import { format, addMonths, subMonths } from 'date-fns';
import { Plus, Check, Trash2, ChevronLeft, ChevronRight, Copy, AlertCircle, RefreshCw, Link2 } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';

function monthStr(d) { return format(d, 'yyyy-MM'); }

export default function BudgetsPage() {
  const [month, setMonth] = useState(new Date());
  const [items, setItems] = useState([]);
  const [months, setMonths] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editAmt, setEditAmt] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCat, setAddCat] = useState('');
  const [addAmt, setAddAmt] = useState('');
  const [error, setError] = useState('');

  const ms = monthStr(month);

  async function load() {
    const [iRes, mRes, cRes] = await Promise.all([
      api.get(`/metrics/expenses/budget-items?month=${ms}`),
      api.get('/metrics/expenses/budget-items/months'),
      api.get('/metrics/expenses/budget-categories'),
    ]);
    if (iRes.ok) setItems(await iRes.json());
    if (mRes.ok) setMonths(await mRes.json());
    if (cRes.ok) setCategories(await cRes.json());
  }

  useEffect(() => { load(); }, [ms]);

  async function handleSaveAmt(id) {
    await api.put(`/metrics/expenses/budget-items/${id}`, { monthly_amount: Number(editAmt) });
    setEditing(null); load();
  }

  async function handleAdd() {
    if (!addName || !addCat || !addAmt) return;
    setError('');
    const r = await api.post('/metrics/expenses/budget-items', {
      month: ms, name: addName, budget_category: addCat, planned_amount: Number(addAmt),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setShowAdd(false); setAddName(''); setAddCat(''); setAddAmt(''); load();
  }

  async function handleDelete(id) {
    await api.delete(`/metrics/expenses/budget-items/${id}`);
    load();
  }

  async function handlePopulate() {
    setError('');
    const r = await api.post(`/metrics/expenses/budget-items/populate?month=${ms}`);
    if (r.ok) { const d = await r.json(); if (d.populated === 0) setError('No new recurring expenses to add.'); }
    load();
  }

  async function handleCopy() {
    setError('');
    const nextMs = monthStr(addMonths(month, 1));
    const r = await api.post(`/metrics/expenses/budget-items/copy?from=${ms}&to=${nextMs}`);
    if (r.ok) setMonth(addMonths(month, 1));
    else { const d = await r.json().catch(() => ({})); setError(d.detail || 'Copy failed'); }
  }

  const totalPlanned = items.reduce((s, i) => s + i.planned_amount, 0);
  const totalActual = items.reduce((s, i) => s + i.actual_amount, 0);
  const totalVariance = totalActual - totalPlanned;
  const hasNextMonth = months.includes(monthStr(addMonths(month, 1)));

  return (
    <div className="max-w-3xl space-y-5">
      {/* Month nav */}
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
        <div className="flex gap-2">
          <button onClick={handlePopulate} className="btn-ghost text-xs gap-1.5"><RefreshCw size={12} /> From Recurring</button>
          {!hasNextMonth && items.length > 0 && (
            <button onClick={handleCopy} className="btn-ghost text-xs gap-1.5"><Copy size={12} /> Copy to {format(addMonths(month, 1), 'MMM')}</button>
          )}
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs gap-1.5"><Plus size={12} /> Add Item</button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs"><AlertCircle size={12} /> {error}</div>}

      {/* Totals */}
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

      {/* Add form */}
      {showAdd && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">Add Planned Expense</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Name</label>
              <input type="text" required maxLength={128} className="arc-input text-sm font-light"
                placeholder="Hertz Rental, New Tires..." value={addName} onChange={(e) => setAddName(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Category</label>
              <select className="arc-input text-sm font-light" value={addCat} onChange={(e) => setAddCat(e.target.value)}>
                <option value="">Select...</option>
                {categories.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Planned Amount</label>
              <input type="number" step="0.01" min="0" required className="arc-input text-sm font-light font-mono"
                placeholder="$0.00" value={addAmt} onChange={(e) => setAddAmt(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="btn-ghost text-xs">Cancel</button>
            <button onClick={handleAdd} className="btn-primary text-xs">Add</button>
          </div>
        </div>
      )}

      {/* Budget items table */}
      {items.length > 0 && (
        <div className="metal-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
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
                      <div className="flex items-center gap-2">
                        <span className="text-ink-100 font-medium">{i.name}</span>
                        {i.recurring_expense_id && <Link2 size={10} className="text-arc shrink-0" title="From recurring" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-arc/10 text-arc border border-arc/20 uppercase">{i.category_label?.slice(0, 12)}</span>
                        {i.frequency_note && <span className="text-[9px] text-ink-500">{i.frequency_note}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-ink-500">$</span>
                          <input type="number" step="0.01" min="0" className="arc-input text-xs font-light font-mono py-1 w-20 text-right"
                            value={editAmt} onChange={(e) => setEditAmt(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAmt(i.id); if (e.key === 'Escape') setEditing(null); }}
                            autoFocus />
                          <button onClick={() => handleSaveAmt(i.id)} className="text-arc hover:text-ink-50 p-0.5"><Check size={12} /></button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditing(i.id); setEditAmt(i.planned_amount); }}
                          className="font-normal font-mono text-ink-300 hover:text-arc transition-colors">
                          {formatCurrency(i.planned_amount)}
                        </button>
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
                      <button onClick={() => handleDelete(i.id)} className="text-ink-500 hover:text-error p-0.5 transition-colors"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="metal-card px-6 py-8 text-center space-y-3">
          <p className="text-ink-300 text-sm">No budget for {format(month, 'MMMM yyyy')}.</p>
          <div className="flex gap-2 justify-center">
            <button onClick={handlePopulate} className="btn-primary text-xs gap-1.5"><RefreshCw size={12} /> Populate from Recurring</button>
            <button onClick={() => setShowAdd(true)} className="btn-ghost text-xs gap-1.5"><Plus size={12} /> Start from Scratch</button>
            {months.length > 0 && (
              <button onClick={() => {
                const latest = months[months.length - 1];
                api.post(`/metrics/expenses/budget-items/copy?from=${latest}&to=${ms}`).then(() => load());
              }} className="btn-ghost text-xs gap-1.5"><Copy size={12} /> Copy from {months[months.length - 1]}</button>
            )}
          </div>
        </div>
      )}

      {/* Month pills */}
      {months.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-ink-500 py-1">Budgets:</span>
          {months.map((m) => (
            <button key={m} onClick={() => { const [y, mo] = m.split('-'); setMonth(new Date(Number(y), Number(mo) - 1)); }}
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                m === ms ? 'border-arc/40 bg-arc/10 text-arc' : 'border-obsidian-600 text-ink-400 hover:text-ink-200'
              }`}>{m}</button>
          ))}
        </div>
      )}
    </div>
  );
}
