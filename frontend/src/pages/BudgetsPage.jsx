import { useEffect, useState } from 'react';
import { format, addMonths, subMonths } from 'date-fns';
import { Plus, Check, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Copy, AlertCircle, Settings } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';

function monthStr(d) { return format(d, 'yyyy-MM'); }

export default function BudgetsPage() {
  const [month, setMonth] = useState(new Date());
  const [budgets, setBudgets] = useState([]);
  const [summary, setSummary] = useState([]);
  const [months, setMonths] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editAmt, setEditAmt] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);
  const [addCat, setAddCat] = useState('');
  const [addAmt, setAddAmt] = useState('');
  const [showCatMgmt, setShowCatMgmt] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatTax, setNewCatTax] = useState(false);
  const [error, setError] = useState('');

  const ms = monthStr(month);

  async function load() {
    const [bRes, sRes, mRes, cRes] = await Promise.all([
      api.get(`/metrics/expenses/budgets?month=${ms}`),
      api.get(`/metrics/expenses/budgets/summary?month=${ms}`),
      api.get('/metrics/expenses/budgets/months'),
      api.get('/metrics/expenses/budget-categories'),
    ]);
    if (bRes.ok) setBudgets(await bRes.json());
    if (sRes.ok) setSummary(await sRes.json());
    if (mRes.ok) setMonths(await mRes.json());
    if (cRes.ok) setCategories(await cRes.json());
  }

  useEffect(() => { load(); }, [ms]);

  async function handleSaveAmt(category) {
    await api.put(`/metrics/expenses/budgets/${category}?month=${ms}`, { monthly_amount: Number(editAmt) });
    setEditing(null);
    load();
  }

  async function handleAddItem() {
    if (!addCat || !addAmt) return;
    setError('');
    const r = await api.post('/metrics/expenses/budgets', { budget_category: addCat, month: ms, monthly_amount: Number(addAmt) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setShowAddItem(false);
    setAddCat('');
    setAddAmt('');
    load();
  }

  async function handleRemoveItem(category) {
    await api.delete(`/metrics/expenses/budgets/${category}?month=${ms}`);
    load();
  }

  async function handleCopyForward() {
    setError('');
    const nextMs = monthStr(addMonths(month, 1));
    const r = await api.post(`/metrics/expenses/budgets/copy?from=${ms}&to=${nextMs}`);
    if (r.ok) { setMonth(addMonths(month, 1)); }
    else { const d = await r.json().catch(() => ({})); setError(d.detail || 'Copy failed'); }
  }

  async function handleCreateCategory() {
    if (!newCatName || !newCatLabel) return;
    setError('');
    const r = await api.post('/metrics/expenses/budget-categories', {
      name: newCatName, label: newCatLabel, tax_deductible: newCatTax,
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setNewCatName('');
    setNewCatLabel('');
    setNewCatTax(false);
    load();
  }

  async function handleDisableCategory(name) {
    if (!window.confirm('Disable this category? It will be hidden from future use.')) return;
    await api.delete(`/metrics/expenses/budget-categories/${name}`);
    load();
  }

  // Categories not already in this month's budget
  const usedCats = new Set(budgets.map((b) => b.budget_category));
  const availableCats = categories.filter((c) => !usedCats.has(c.name));

  const rows = budgets.map((b) => {
    const s = summary.find((r) => r.budget_category === b.budget_category) || {};
    return { ...b, spent: s.spent || 0, remaining: s.remaining || 0, pct_used: s.pct_used || 0 };
  });

  const totalAllocated = rows.reduce((s, r) => s + Number(r.monthly_amount), 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalDeductibleSpent = rows.filter((r) => r.tax_deductible).reduce((s, r) => s + r.spent, 0);
  const hasNextMonth = months.includes(monthStr(addMonths(month, 1)));

  return (
    <div className="max-w-3xl space-y-5">
      {/* Month navigator */}
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
          {!hasNextMonth && budgets.length > 0 && (
            <button onClick={handleCopyForward} className="btn-ghost text-xs gap-1.5">
              <Copy size={12} /> Copy to {format(addMonths(month, 1), 'MMM yyyy')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {/* Totals strip */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="metal-card px-3 py-2.5">
            <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide">Total Budget</p>
            <p className="text-base font-normal font-mono text-ink-300">{formatCurrency(totalAllocated)}</p>
          </div>
          <div className="metal-card px-3 py-2.5">
            <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide">Total Spent</p>
            <p className={`text-base font-normal font-mono ${totalSpent > totalAllocated ? 'text-error' : 'text-ink-300'}`}>
              {formatCurrency(totalSpent)}
            </p>
          </div>
          <div className="metal-card px-3 py-2.5">
            <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide">Tax Deductible</p>
            <p className="text-base font-normal font-mono text-success">{formatCurrency(totalDeductibleSpent)}</p>
            <p className="text-[9px] text-ink-500">~{formatCurrency(totalDeductibleSpent * 0.22)} est. IRS write-off</p>
          </div>
        </div>
      )}

      {/* Budget table */}
      {budgets.length > 0 && (
        <div className="metal-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Category</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Budget</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Spent</th>
                <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Used</th>
                <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Tax</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isEditing = editing === r.budget_category;
                const over = r.spent > Number(r.monthly_amount) && Number(r.monthly_amount) > 0;
                return (
                  <tr key={r.budget_category} className="border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-ink-100 font-medium">{r.label}</p>
                      <p className="text-[9px] text-ink-600 font-mono">{r.budget_category}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-ink-500">$</span>
                          <input type="number" step="0.01" min="0" className="arc-input text-xs font-light font-mono py-1 w-20 text-right"
                            value={editAmt} onChange={(e) => setEditAmt(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAmt(r.budget_category); if (e.key === 'Escape') setEditing(null); }}
                            autoFocus />
                          <button onClick={() => handleSaveAmt(r.budget_category)} className="text-arc hover:text-ink-50 p-0.5"><Check size={12} /></button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditing(r.budget_category); setEditAmt(r.monthly_amount); }}
                          className="font-normal font-mono text-ink-300 hover:text-arc transition-colors">
                          {formatCurrency(r.monthly_amount)}
                        </button>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-normal font-mono ${over ? 'text-error' : 'text-ink-300'}`}>
                      {formatCurrency(r.spent)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-16 h-1.5 rounded-full bg-obsidian-700 overflow-hidden">
                          <div className={`h-full rounded-full ${over ? 'bg-error' : r.pct_used >= 80 ? 'bg-ember' : 'bg-arc'}`}
                            style={{ width: `${Math.min(r.pct_used, 100)}%` }} />
                        </div>
                        <span className="text-[9px] text-ink-500 font-mono w-8 text-right">{r.pct_used}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.tax_deductible
                        ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30">YES</span>
                        : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-obsidian-700 text-ink-500">NO</span>}
                    </td>
                    <td className="px-2 py-3">
                      <button onClick={() => handleRemoveItem(r.budget_category)} className="text-ink-500 hover:text-error p-0.5 transition-colors"
                        title="Remove from this month"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Add category to this month */}
          <div className="px-4 py-2 border-t border-obsidian-700/50">
            {showAddItem ? (
              <div className="flex items-center gap-2">
                <select className="arc-input text-xs font-light py-1 flex-1" value={addCat} onChange={(e) => setAddCat(e.target.value)}>
                  <option value="">Select category...</option>
                  {availableCats.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
                </select>
                <input type="number" step="0.01" min="0" placeholder="$0.00" className="arc-input text-xs font-light font-mono py-1 w-24"
                  value={addAmt} onChange={(e) => setAddAmt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }} />
                <button onClick={handleAddItem} className="btn-primary text-[10px] py-1 px-2">Add</button>
                <button onClick={() => setShowAddItem(false)} className="btn-ghost text-[10px] py-1">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowAddItem(true)} className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-50 transition-colors">
                <Plus size={12} /> Add category to {format(month, 'MMM yyyy')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty month */}
      {budgets.length === 0 && (
        <div className="metal-card px-6 py-8 text-center space-y-3">
          <p className="text-ink-300 text-sm">No budget defined for {format(month, 'MMMM yyyy')}.</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => setShowAddItem(true)} className="btn-primary text-xs gap-1.5"><Plus size={12} /> Start Fresh</button>
            {months.length > 0 && (
              <button onClick={() => {
                const latest = months[months.length - 1];
                api.post(`/metrics/expenses/budgets/copy?from=${latest}&to=${ms}`).then(() => load());
              }} className="btn-ghost text-xs gap-1.5"><Copy size={12} /> Copy from {months[months.length - 1]}</button>
            )}
          </div>
          {showAddItem && (
            <div className="flex items-center gap-2 justify-center mt-3">
              <select className="arc-input text-xs font-light py-1 w-40" value={addCat} onChange={(e) => setAddCat(e.target.value)}>
                <option value="">Select category...</option>
                {categories.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
              </select>
              <input type="number" step="0.01" min="0" placeholder="$0.00" className="arc-input text-xs font-light font-mono py-1 w-24"
                value={addAmt} onChange={(e) => setAddAmt(e.target.value)} />
              <button onClick={handleAddItem} className="btn-primary text-[10px] py-1 px-2">Add</button>
            </div>
          )}
        </div>
      )}

      {/* Month pills */}
      {months.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-ink-500 py-1">Budget months:</span>
          {months.map((m) => (
            <button key={m} onClick={() => { const [y, mo] = m.split('-'); setMonth(new Date(Number(y), Number(mo) - 1)); }}
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                m === ms ? 'border-arc/40 bg-arc/10 text-arc' : 'border-obsidian-600 text-ink-400 hover:text-ink-200'
              }`}>
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Category Management (collapsible) */}
      <div className="metal-card overflow-hidden">
        <button type="button" onClick={() => setShowCatMgmt(!showCatMgmt)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-obsidian-800/30 transition-colors">
          <Settings size={14} className="text-ink-400" />
          <span className="text-xs font-semibold text-ink-200">Manage Categories</span>
          <span className="text-[10px] text-ink-500 ml-1">{categories.length} categories</span>
          <div className="ml-auto">
            {showCatMgmt ? <ChevronUp size={14} className="text-ink-400" /> : <ChevronDown size={14} className="text-ink-400" />}
          </div>
        </button>

        {showCatMgmt && (
          <div className="border-t border-obsidian-700/50">
            <div className="max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {categories.map((c) => (
                <div key={c.name} className="flex items-center gap-3 px-4 py-2 border-b border-obsidian-700/20 hover:bg-obsidian-800/20">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-ink-100">{c.label}</span>
                    <span className="text-[9px] text-ink-600 font-mono ml-2">{c.name}</span>
                  </div>
                  {c.tax_deductible
                    ? <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-success/15 text-success">TAX</span>
                    : <span className="text-[8px] text-ink-600">—</span>}
                  <button onClick={() => handleDisableCategory(c.name)} className="text-ink-500 hover:text-error p-0.5 transition-colors" title="Disable">
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
            {/* Add new category */}
            <div className="px-4 py-3 border-t border-obsidian-700/50">
              <div className="flex items-center gap-2">
                <input type="text" placeholder="name_key" maxLength={32} className="arc-input text-xs font-light font-mono py-1 w-28"
                  value={newCatName} onChange={(e) => setNewCatName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
                <input type="text" placeholder="Display Label" maxLength={64} className="arc-input text-xs font-light py-1 flex-1"
                  value={newCatLabel} onChange={(e) => setNewCatLabel(e.target.value)} />
                <label className="flex items-center gap-1 text-[10px] text-ink-400 cursor-pointer">
                  <input type="checkbox" checked={newCatTax} onChange={(e) => setNewCatTax(e.target.checked)} />
                  Tax
                </label>
                <button onClick={handleCreateCategory} disabled={!newCatName || !newCatLabel}
                  className="btn-primary text-[10px] py-1 px-2">Add</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
