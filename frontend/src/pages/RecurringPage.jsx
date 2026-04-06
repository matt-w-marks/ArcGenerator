import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, AlertCircle, Pencil, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/utils';

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }

export default function RecurringPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ budget_category: '', amount: '', frequency: 'weekly', vendor: '', description: '', start_date: todayStr() });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState('');

  const catLabel = (name) => categories.find((c) => c.name === name)?.label || name;

  async function load() {
    const [rRes, cRes] = await Promise.all([
      api.get('/metrics/expenses/recurring'),
      api.get('/metrics/expenses/budget-categories'),
    ]);
    if (rRes.ok) setItems(await rRes.json());
    if (cRes.ok) {
      const cats = await cRes.json();
      setCategories(cats);
      setForm((f) => f.budget_category ? f : { ...f, budget_category: cats[0]?.name || '' });
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    const body = { ...form, amount: Number(form.amount) };
    const r = await api.post('/metrics/expenses/recurring', body);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setForm({ budget_category: categories[0]?.name || '', amount: '', frequency: 'weekly', vendor: '', description: '', start_date: todayStr() });
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this recurring expense?')) return;
    await api.delete(`/metrics/expenses/recurring/${id}`);
    load();
  }

  function startEdit(i) {
    setEditing(i.id);
    setEditForm({ amount: i.amount, vendor: i.vendor || '', description: i.description || '', frequency: i.frequency, start_date: i.start_date || '' });
  }

  async function handleSaveEdit(id) {
    await api.put(`/metrics/expenses/recurring/${id}`, {
      amount: Number(editForm.amount), vendor: editForm.vendor || null,
      description: editForm.description || null, frequency: editForm.frequency,
      start_date: editForm.start_date || null,
    });
    setEditing(null);
    load();
  }

  async function handleToggle(id, active) {
    await api.put(`/metrics/expenses/recurring/${id}`, { active: !active });
    load();
  }

  const totalMonthly = items.filter((i) => i.active).reduce((s, i) => s + i.monthly_projection, 0);

  return (
    <div className="max-w-3xl xl:max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-100">Recurring Expenses</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            Auto-generated on schedule. Total: {formatCurrency(totalMonthly)}/month projected.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-xs gap-1.5">
          <Plus size={12} /> Add Recurring
        </button>
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
                  {categories.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
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
              {items.map((i) => {
                const isEditing = editing === i.id;
                return (
                <tr key={i.id} className={`border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors ${!i.active ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="space-y-1">
                        <input type="text" className="arc-input text-xs font-light py-1 w-full" placeholder="Vendor"
                          value={editForm.vendor} onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })} />
                        <input type="text" className="arc-input text-xs font-light py-1 w-full" placeholder="Description"
                          value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                        <input type="date" className="arc-input text-xs font-light py-1 w-full"
                          value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} />
                      </div>
                    ) : (
                      <>
                        <p className="text-ink-100">{i.vendor || i.description || catLabel(i.budget_category)}</p>
                        <p className="text-[9px] text-ink-500">{catLabel(i.budget_category)} · started {i.start_date}</p>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <input type="number" step="0.01" min="0" className="arc-input text-xs font-light font-mono py-1 w-20 text-right"
                        value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
                    ) : (
                      <span className="font-normal font-mono text-ink-300">{formatCurrency(i.amount)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isEditing ? (
                      <select className="arc-input text-[10px] font-light py-1" value={editForm.frequency}
                        onChange={(e) => setEditForm({ ...editForm, frequency: e.target.value })}>
                        {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    ) : (
                      <span className="text-[10px] text-ink-400 capitalize">{i.frequency}</span>
                    )}
                  </td>
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
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={() => handleSaveEdit(i.id)} className="text-arc hover:text-ink-50 p-0.5"><Check size={12} /></button>
                          <button onClick={() => setEditing(null)} className="text-ink-400 hover:text-ink-50 p-0.5"><X size={12} /></button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(i)} className="text-ink-400 hover:text-ink-50 p-0.5"><Pencil size={12} /></button>
                      )}
                      <button onClick={() => handleDelete(i.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
