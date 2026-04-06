import { useEffect, useState } from 'react';
import { Plus, Pencil, Check, X, Trash2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

export default function ExpenseCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', label: '', tax_deductible: false, tax_notes: '', sort_order: 0 });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState('');

  async function load() {
    const r = await api.get('/metrics/expenses/budget-categories?include_inactive=true');
    if (r.ok) setCategories(await r.json());
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    const r = await api.post('/metrics/expenses/budget-categories', {
      ...addForm, sort_order: Number(addForm.sort_order),
      tax_notes: addForm.tax_notes || null,
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setAddForm({ name: '', label: '', tax_deductible: false, tax_notes: '', sort_order: 0 });
    setShowAdd(false);
    load();
  }

  async function handleSaveEdit(name) {
    setError('');
    const r = await api.put(`/metrics/expenses/budget-categories/${name}`, {
      label: editForm.label,
      tax_deductible: editForm.tax_deductible,
      tax_notes: editForm.tax_notes || null,
      sort_order: Number(editForm.sort_order),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setEditing(null);
    load();
  }

  async function handleDisable(name) {
    if (!window.confirm('Disable this category? It will be hidden from dropdowns.')) return;
    await api.delete(`/metrics/expenses/budget-categories/${name}`);
    load();
  }

  return (
    <div className="max-w-3xl xl:max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-100">Expense Categories</h2>
          <p className="text-xs text-ink-500 mt-0.5">Manage budget categories used across expenses, budgets, and recurring items.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs gap-1.5">
          <Plus size={12} /> Add Category
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {showAdd && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">New Category</h3>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Slug (key)</label>
                <input type="text" required maxLength={32} pattern="^[a-z][a-z0-9_]*$" className="arc-input text-sm font-light font-mono"
                  placeholder="e.g. vehicle_rental" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
                <p className="text-[9px] text-ink-600 mt-0.5">Lowercase, underscores only</p>
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Display Label</label>
                <input type="text" required maxLength={64} className="arc-input text-sm font-light"
                  placeholder="Vehicle Rental" value={addForm.label} onChange={(e) => setAddForm({ ...addForm, label: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Sort Order</label>
                <input type="number" min="0" className="arc-input text-sm font-light font-mono"
                  value={addForm.sort_order} onChange={(e) => setAddForm({ ...addForm, sort_order: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
                <input type="checkbox" id="add-tax" className="accent-arc"
                  checked={addForm.tax_deductible} onChange={(e) => setAddForm({ ...addForm, tax_deductible: e.target.checked })} />
                <label htmlFor="add-tax" className="text-xs text-ink-300">Tax Deductible</label>
              </div>
              {addForm.tax_deductible && (
                <div className="col-span-2">
                  <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Tax Notes</label>
                  <input type="text" maxLength={256} className="arc-input text-sm font-light"
                    placeholder="IRS schedule C, etc." value={addForm.tax_notes} onChange={(e) => setAddForm({ ...addForm, tax_notes: e.target.value })} />
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs">Create</button>
            </div>
          </form>
        </div>
      )}

      {categories.length > 0 && (
        <div className="metal-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Category</th>
                <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Tax</th>
                <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Order</th>
                <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const isEditing = editing === c.name;
                return (
                  <tr key={c.name} className={`border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors ${!c.active ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="space-y-1">
                          <input type="text" className="arc-input text-xs font-light py-1 w-full" placeholder="Display Label"
                            value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} />
                          <div className="flex items-center gap-2">
                            <input type="checkbox" id={`edit-tax-${c.name}`} className="accent-arc"
                              checked={editForm.tax_deductible} onChange={(e) => setEditForm({ ...editForm, tax_deductible: e.target.checked })} />
                            <label htmlFor={`edit-tax-${c.name}`} className="text-[10px] text-ink-400">Tax Deductible</label>
                          </div>
                          {editForm.tax_deductible && (
                            <input type="text" className="arc-input text-[10px] font-light py-1 w-full" placeholder="Tax notes"
                              value={editForm.tax_notes} onChange={(e) => setEditForm({ ...editForm, tax_notes: e.target.value })} />
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="text-ink-100">{c.label}</p>
                          <p className="text-[9px] text-ink-500 font-mono">{c.name}</p>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!isEditing && (
                        c.tax_deductible
                          ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/30">YES</span>
                          : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-obsidian-700 text-ink-500">NO</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <input type="number" min="0" className="arc-input text-xs font-light font-mono py-1 w-14 text-center"
                          value={editForm.sort_order} onChange={(e) => setEditForm({ ...editForm, sort_order: e.target.value })} />
                      ) : (
                        <span className="text-xs text-ink-400 font-mono">{c.sort_order}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        c.active ? 'bg-success/15 text-success border border-success/30' : 'bg-obsidian-700 text-ink-500'
                      }`}>{c.active ? 'Active' : 'Disabled'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={() => handleSaveEdit(c.name)} className="text-arc hover:text-ink-50 p-0.5"><Check size={12} /></button>
                            <button onClick={() => setEditing(null)} className="text-ink-400 hover:text-ink-50 p-0.5"><X size={12} /></button>
                          </>
                        ) : (
                          <button onClick={() => {
                            setEditing(c.name);
                            setEditForm({ label: c.label, tax_deductible: c.tax_deductible, tax_notes: c.tax_notes || '', sort_order: c.sort_order });
                          }} className="text-ink-400 hover:text-ink-50 p-0.5"><Pencil size={12} /></button>
                        )}
                        {c.active && (
                          <button onClick={() => handleDisable(c.name)} className="text-ink-400 hover:text-error p-0.5 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {categories.length === 0 && (
        <div className="metal-card px-6 py-8 text-center">
          <p className="text-ink-400 text-sm">No expense categories configured.</p>
          <p className="text-ink-500 text-xs mt-1">Add categories to organize your expenses and budgets.</p>
        </div>
      )}
    </div>
  );
}
