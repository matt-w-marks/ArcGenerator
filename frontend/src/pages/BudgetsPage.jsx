import { useEffect, useState } from 'react';
import { Check, Copy, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { format, addMonths, subMonths } from 'date-fns';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';

const CAT_LABELS = {
  fuel: 'Fuel', vehicle_maintenance: 'Vehicle Maintenance', vehicle_supplies: 'Vehicle Supplies',
  vehicle_rental: 'Vehicle Rental', insurance: 'Insurance', tolls_parking: 'Tolls & Parking',
  food_meals: 'Food & Meals', technology: 'Technology', licensing: 'Licensing',
  professional_services: 'Professional Services', other: 'Other',
};

function monthStr(d) { return format(d, 'yyyy-MM'); }

export default function BudgetsPage() {
  const [month, setMonth] = useState(new Date());
  const [budgets, setBudgets] = useState([]);
  const [summary, setSummary] = useState([]);
  const [months, setMonths] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editAmt, setEditAmt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ms = monthStr(month);

  async function load() {
    const [bRes, sRes, mRes] = await Promise.all([
      api.get(`/metrics/expenses/budgets?month=${ms}`),
      api.get(`/metrics/expenses/budgets/summary?month=${ms}`),
      api.get('/metrics/expenses/budgets/months'),
    ]);
    if (bRes.ok) setBudgets(await bRes.json());
    if (sRes.ok) setSummary(await sRes.json());
    if (mRes.ok) setMonths(await mRes.json());
  }

  useEffect(() => { load(); }, [ms]);

  async function handleSave(category) {
    setSaving(true);
    await api.put(`/metrics/expenses/budgets/${category}?month=${ms}`, { monthly_amount: Number(editAmt) });
    setEditing(null);
    setSaving(false);
    load();
  }

  async function handleCopyForward() {
    setError('');
    const nextMs = monthStr(addMonths(month, 1));
    const r = await api.post(`/metrics/expenses/budgets/copy?from=${ms}&to=${nextMs}`);
    if (r.ok) {
      setMonth(addMonths(month, 1));
    } else {
      const body = await r.json().catch(() => ({}));
      setError(body.detail || 'Copy failed');
    }
  }

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
        {!hasNextMonth && (
          <button onClick={handleCopyForward} className="btn-ghost text-xs gap-1.5">
            <Copy size={12} /> Copy to {format(addMonths(month, 1), 'MMM yyyy')}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {/* No budgets for this month */}
      {budgets.length === 0 && (
        <div className="metal-card px-6 py-8 text-center space-y-2">
          <p className="text-ink-300 text-sm">No budgets defined for {format(month, 'MMMM yyyy')}.</p>
          {months.length > 0 && (
            <button onClick={handleCopyForward} className="btn-primary text-xs gap-1.5">
              <Copy size={12} /> Copy from {months[months.length - 1]}
            </button>
          )}
        </div>
      )}

      {budgets.length > 0 && (
        <>
          {/* Totals strip */}
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
              <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide">Tax Deductible Spend</p>
              <p className="text-base font-normal font-mono text-success">{formatCurrency(totalDeductibleSpent)}</p>
              <p className="text-[9px] text-ink-500">~{formatCurrency(totalDeductibleSpent * 0.22)} est. IRS write-off</p>
            </div>
          </div>

          {/* Budget table */}
          <div className="metal-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-obsidian-600">
                  <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Category</th>
                  <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Budget</th>
                  <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Spent</th>
                  <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Remaining</th>
                  <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Used</th>
                  <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Tax</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isEditing = editing === r.budget_category;
                  const over = r.spent > Number(r.monthly_amount) && Number(r.monthly_amount) > 0;
                  return (
                    <tr key={r.budget_category} className="border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-ink-100 font-medium">{CAT_LABELS[r.budget_category] || r.budget_category}</p>
                        {r.tax_notes && <p className="text-[9px] text-ink-500 mt-0.5 max-w-xs">{r.tax_notes}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-ink-500">$</span>
                            <input type="number" step="0.01" min="0" className="arc-input text-xs font-light font-mono py-1 w-20 text-right"
                              value={editAmt} onChange={(e) => setEditAmt(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(r.budget_category); if (e.key === 'Escape') setEditing(null); }}
                              autoFocus />
                            <button onClick={() => handleSave(r.budget_category)} disabled={saving}
                              className="text-arc hover:text-ink-50 p-0.5"><Check size={12} /></button>
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
                      <td className={`px-4 py-3 text-right font-normal font-mono ${r.remaining < 0 ? 'text-error' : 'text-ink-400'}`}>
                        {formatCurrency(r.remaining)}
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
                          : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-obsidian-700 text-ink-500">NO</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Existing months */}
          {months.length > 1 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-ink-500 py-1">Months with budgets:</span>
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
        </>
      )}
    </div>
  );
}
