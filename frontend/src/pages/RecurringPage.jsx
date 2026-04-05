import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';

const BUDGET_LABELS = {
  fuel: 'Fuel', vehicle_maintenance: 'Vehicle Maintenance', vehicle_supplies: 'Vehicle Supplies',
  vehicle_rental: 'Vehicle Rental', insurance: 'Insurance', tolls_parking: 'Tolls & Parking',
  food_meals: 'Food & Meals', technology: 'Technology', licensing: 'Licensing',
  professional_services: 'Professional Services', other: 'Other',
};
const BUDGET_CATS = Object.keys(BUDGET_LABELS);
const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }

export default function RecurringPage() {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ budget_category: 'vehicle_rental', amount: '', frequency: 'weekly', vendor: '', description: '', start_date: todayStr() });
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  async function load() {
    const r = await api.get('/metrics/expenses/recurring');
    if (r.ok) setItems(await r.json());
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    const body = { ...form, amount: Number(form.amount) };
    const r = await api.post('/metrics/expenses/recurring', body);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setForm({ budget_category: 'vehicle_rental', amount: '', frequency: 'weekly', vendor: '', description: '', start_date: todayStr() });
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this recurring expense?')) return;
    await api.delete(`/metrics/expenses/recurring/${id}`);
    load();
  }

  async function handleToggle(id, active) {
    await api.put(`/metrics/expenses/recurring/${id}`, { active: !active });
    load();
  }

  async function handleGenerate() {
    setGenerating(true);
    const r = await api.post('/metrics/expenses/recurring/generate');
    if (r.ok) {
      const d = await r.json();
      alert(`Generated ${d.generated} expense entries for ${d.month}`);
    }
    setGenerating(false);
  }

  const totalMonthly = items.filter((i) => i.active).reduce((s, i) => s + i.monthly_projection, 0);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-100">Recurring Expenses</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            Auto-generated on schedule. Total: {formatCurrency(totalMonthly)}/month projected.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleGenerate} disabled={generating} className="btn-ghost text-xs gap-1.5">
            <RefreshCw size={12} className={generating ? 'animate-spin' : ''} /> Generate Now
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary text-xs gap-1.5">
            <Plus size={12} /> Add Recurring
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {showForm && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">New Recurring Expense</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Frequency</label>
                <select className="arc-input text-sm font-light" value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Vendor</label>
                <input type="text" maxLength={128} className="arc-input text-sm font-light"
                  placeholder="Hertz, T-Mobile…" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Description</label>
                <input type="text" maxLength={256} className="arc-input text-sm font-light"
                  placeholder="What is this for?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Start Date</label>
                <input type="date" required className="arc-input text-sm font-light"
                  value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs">Create</button>
            </div>
          </form>
        </div>
      )}

      {items.length === 0 && (
        <div className="metal-card px-6 py-8 text-center">
          <p className="text-ink-400 text-sm">No recurring expenses set up.</p>
          <p className="text-ink-500 text-xs mt-1">Add your Hertz rental, phone plan, insurance, etc.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="metal-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Expense</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Amount</th>
                <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Freq</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">~Monthly</th>
                <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={`border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors ${!i.active ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="text-ink-100">{i.vendor || i.description || BUDGET_LABELS[i.budget_category]}</p>
                    <p className="text-[9px] text-ink-500">{BUDGET_LABELS[i.budget_category]} · started {i.start_date}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-normal font-mono text-ink-300">{formatCurrency(i.amount)}</td>
                  <td className="px-4 py-3 text-center text-[10px] text-ink-400 capitalize">{i.frequency}</td>
                  <td className="px-4 py-3 text-right font-normal font-mono text-ink-300">{formatCurrency(i.monthly_projection)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleToggle(i.id, i.active)}
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                        i.active ? 'bg-success/15 text-success border border-success/30' : 'bg-obsidian-700 text-ink-500'
                      }`}>
                      {i.active ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(i.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
