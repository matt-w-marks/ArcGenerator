import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, AlertCircle, Pencil, Check, X, Handshake } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';

const ENGAGEMENT_TYPES = [
  { value: 'consulting', label: 'Consulting' },
  { value: 'advisory', label: 'Advisory' },
  { value: 'expert_network', label: 'Expert Network' },
];
const RATE_UNITS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'session', label: 'Per Session' },
  { value: 'project', label: 'Per Project' },
];
const STATUSES = ['active', 'paused', 'closed'];

export default function EngagementsPage() {
  const [engagements, setEngagements] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', client: '', engagement_type: 'consulting', rate: '', rate_unit: 'hourly', start_date: '', description: '' });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [selectedEng, setSelectedEng] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entryForm, setEntryForm] = useState({ entry_date: '', hours: '', amount: '', description: '' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await api.get('/metrics/income-streams?type=engagement');
    if (r.ok) setEngagements(await r.json());
  }, []);

  const loadEntries = useCallback(async (streamId) => {
    if (!streamId) { setEntries([]); return; }
    const r = await api.get(`/metrics/income-entries?stream_id=${streamId}`);
    if (r.ok) setEntries(await r.json());
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadEntries(selectedEng); }, [selectedEng, loadEntries]);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    const body = {
      ...form, stream_type: 'engagement',
      rate: form.rate ? Number(form.rate) : null,
      start_date: form.start_date || null,
      description: form.description || null,
    };
    const r = await api.post('/metrics/income-streams', body);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setForm({ name: '', client: '', engagement_type: 'consulting', rate: '', rate_unit: 'hourly', start_date: '', description: '' });
    setShowAdd(false);
    load();
  }

  async function handleSaveEdit(id) {
    const body = { ...editForm, rate: editForm.rate ? Number(editForm.rate) : null };
    await api.put(`/metrics/income-streams/${id}`, body);
    setEditing(null);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this engagement?')) return;
    await api.delete(`/metrics/income-streams/${id}`);
    if (selectedEng === id) setSelectedEng(null);
    load();
  }

  async function handleAddEntry(e) {
    e.preventDefault();
    if (!selectedEng) return;
    setError('');
    const body = {
      income_stream_id: selectedEng,
      entry_date: entryForm.entry_date,
      hours: entryForm.hours ? Number(entryForm.hours) : null,
      amount: entryForm.amount ? Number(entryForm.amount) : null,
      description: entryForm.description || null,
    };
    const r = await api.post('/metrics/income-entries', body);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setEntryForm({ entry_date: '', hours: '', amount: '', description: '' });
    loadEntries(selectedEng);
  }

  async function handleDeleteEntry(id) {
    await api.delete(`/metrics/income-entries/${id}`);
    loadEntries(selectedEng);
  }

  const typeLabel = (t) => ENGAGEMENT_TYPES.find((e) => e.value === t)?.label || t;
  const unitLabel = (u) => RATE_UNITS.find((r) => r.value === u)?.label || u;

  const totalEntryAmt = entries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalEntryHrs = entries.reduce((s, e) => s + (e.hours || 0), 0);

  return (
    <div className="max-w-3xl xl:max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Engagements</h1>
          <p className="text-xs text-ink-400 mt-0.5">Consulting, advisory, and expert network sessions</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs gap-1.5">
          <Plus size={12} /> Add Engagement
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-obsidian-700">
        <button type="button" className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 border-arc text-arc">
          <Handshake size={12} /> Clients
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">New Engagement</h3>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Name</label>
                <input type="text" required maxLength={128} className="arc-input text-sm font-light"
                  placeholder="Q2 Advisory" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Client</label>
                <input type="text" maxLength={128} className="arc-input text-sm font-light"
                  placeholder="Jane Doe, Acme Inc" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Type</label>
                <select className="arc-input text-sm font-light" value={form.engagement_type}
                  onChange={(e) => setForm({ ...form, engagement_type: e.target.value })}>
                  {ENGAGEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Rate</label>
                <input type="number" step="0.01" min="0" className="arc-input text-sm font-light font-mono"
                  placeholder="$0.00" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Rate Unit</label>
                <select className="arc-input text-sm font-light" value={form.rate_unit}
                  onChange={(e) => setForm({ ...form, rate_unit: e.target.value })}>
                  {RATE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Start Date</label>
                <input type="date" className="arc-input text-sm font-light"
                  value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Description</label>
                <input type="text" maxLength={512} className="arc-input text-sm font-light"
                  placeholder="Scope of work, context, etc." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Engagement list */}
      {engagements.length === 0 && !showAdd && (
        <div className="metal-card px-6 py-8 text-center">
          <p className="text-ink-400 text-sm">No engagements yet.</p>
          <p className="text-ink-500 text-xs mt-1">Add consulting, advisory, or expert network gigs.</p>
        </div>
      )}

      {engagements.length > 0 && (
        <div className="metal-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Engagement</th>
                <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Type</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Rate</th>
                <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {engagements.map((eng) => {
                const isEditing = editing === eng.id;
                const isSelected = selectedEng === eng.id;
                return (
                  <tr key={eng.id}
                    onClick={() => !isEditing && setSelectedEng(isSelected ? null : eng.id)}
                    className={`border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors cursor-pointer ${
                      isSelected ? 'bg-arc/5 border-l-2 border-l-arc' : ''
                    } ${eng.status !== 'active' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="space-y-1">
                          <input type="text" className="arc-input text-xs font-light py-1 w-full" placeholder="Client"
                            value={editForm.client} onChange={(e) => setEditForm({ ...editForm, client: e.target.value })}
                            onClick={(e) => e.stopPropagation()} />
                          <input type="text" className="arc-input text-xs font-light py-1 w-full" placeholder="Description"
                            value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            onClick={(e) => e.stopPropagation()} />
                        </div>
                      ) : (
                        <>
                          <p className="text-ink-100">{eng.client || eng.name}</p>
                          <p className="text-[9px] text-ink-500">{eng.name}{eng.start_date ? ` · since ${eng.start_date}` : ''}</p>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <select className="arc-input text-[10px] font-light py-1" value={editForm.engagement_type}
                          onChange={(e) => setEditForm({ ...editForm, engagement_type: e.target.value })}
                          onClick={(e) => e.stopPropagation()}>
                          {ENGAGEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      ) : (
                        <span className="text-[10px] text-ink-400">{typeLabel(eng.engagement_type)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input type="number" step="0.01" min="0" className="arc-input text-xs font-light font-mono py-1 w-20 text-right"
                          value={editForm.rate} onChange={(e) => setEditForm({ ...editForm, rate: e.target.value })}
                          onClick={(e) => e.stopPropagation()} />
                      ) : (
                        <span className="font-normal font-mono text-ink-300">
                          {eng.rate ? formatCurrency(eng.rate) : '—'}
                          {eng.rate && <span className="text-[9px] text-ink-500 ml-1">/{unitLabel(eng.rate_unit)}</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        eng.status === 'active' ? 'bg-success/15 text-success border border-success/30'
                          : eng.status === 'paused' ? 'bg-ember/15 text-ember border border-ember/30'
                          : 'bg-obsidian-700 text-ink-500'
                      }`}>{eng.status}</span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={() => handleSaveEdit(eng.id)} className="text-arc hover:text-ink-50 p-0.5"><Check size={12} /></button>
                            <button onClick={() => setEditing(null)} className="text-ink-400 hover:text-ink-50 p-0.5"><X size={12} /></button>
                          </>
                        ) : (
                          <button onClick={() => {
                            setEditing(eng.id);
                            setEditForm({ client: eng.client || '', description: eng.description || '', engagement_type: eng.engagement_type || 'consulting', rate: eng.rate || '', rate_unit: eng.rate_unit || 'hourly', status: eng.status });
                          }} className="text-ink-400 hover:text-ink-50 p-0.5"><Pencil size={12} /></button>
                        )}
                        <button onClick={() => handleDelete(eng.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors">
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

      {/* Session/income log for selected engagement */}
      {selectedEng && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-100">Session Log</h3>
              <p className="text-xs text-ink-500 mt-0.5">
                {entries.length} sessions · {formatCurrency(totalEntryAmt)} earned · {totalEntryHrs.toFixed(1)}h
              </p>
            </div>
          </div>

          <form onSubmit={handleAddEntry} className="metal-card p-3">
            <div className="flex items-end gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Date</label>
                <input type="date" required className="arc-input text-xs font-light py-1"
                  value={entryForm.entry_date} onChange={(e) => setEntryForm({ ...entryForm, entry_date: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Hours</label>
                <input type="number" step="0.25" min="0" className="arc-input text-xs font-light font-mono py-1 w-16"
                  placeholder="1.5" value={entryForm.hours} onChange={(e) => setEntryForm({ ...entryForm, hours: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Amount</label>
                <input type="number" step="0.01" min="0" className="arc-input text-xs font-light font-mono py-1 w-24"
                  placeholder="$0.00" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Description</label>
                <input type="text" maxLength={256} className="arc-input text-xs font-light py-1 w-full"
                  placeholder="Call topic, deliverable, etc." value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} />
              </div>
              <button type="submit" className="btn-primary text-xs py-1">Add</button>
            </div>
          </form>

          {entries.length > 0 && (
            <div className="metal-card overflow-hidden max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {entries.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors">
                  <span className="text-[10px] text-ink-500 font-mono shrink-0">{formatDate(e.entry_date)}</span>
                  <span className="flex-1 text-xs text-ink-300 truncate">{e.description || '—'}</span>
                  {e.hours != null && <span className="text-xs text-ink-400 font-mono shrink-0">{e.hours}h</span>}
                  {e.amount != null && <span className="text-xs font-mono text-success shrink-0">{formatCurrency(e.amount)}</span>}
                  <button onClick={() => handleDeleteEntry(e.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
