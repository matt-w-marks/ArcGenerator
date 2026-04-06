import { useEffect, useState, useCallback } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import { Plus, Trash2, AlertCircle, Pencil, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const ROLE_TYPES = [
  { value: 'ft', label: 'Full-Time' },
  { value: 'pt', label: 'Part-Time' },
  { value: 'ic', label: 'Independent Contractor' },
  { value: 'contract', label: 'Contract' },
];
const COMP_TYPES = [
  { value: 'salary', label: 'Salary' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'project', label: 'Project' },
  { value: 'commission', label: 'Commission' },
];
const PAY_FREQS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'semimonthly', label: 'Semi-monthly' },
  { value: 'monthly', label: 'Monthly' },
];
const STATUSES = ['active', 'paused', 'closed'];

// ── Pipeline (Job Search) ──────────────────────────────────────────────────

const APP_STATUSES = ['applied', 'phone_screen', 'interview', 'offer', 'rejected', 'withdrawn'];
const STATUS_COLORS = {
  applied: '#00D4FF', phone_screen: '#FFB020', interview: '#8B5CF6',
  offer: '#10B981', rejected: '#EF4444', withdrawn: '#4B5563',
};

function StatusChart({ jobs }) {
  const counts = APP_STATUSES.map((s) => jobs.filter((j) => j.status === s).length);
  const data = {
    labels: APP_STATUSES.map((s) => s.replace('_', ' ')),
    datasets: [{
      data: counts,
      backgroundColor: APP_STATUSES.map((s) => STATUS_COLORS[s] + '33'),
      borderColor: APP_STATUSES.map((s) => STATUS_COLORS[s]),
      borderWidth: 2, borderRadius: 4,
    }],
  };
  const options = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#6B7280' }, grid: { display: false } },
      y: { ticks: { color: '#6B7280', stepSize: 1 }, grid: { color: 'rgba(42,51,66,0.6)' } },
    },
  };
  return <Bar data={data} options={options} />;
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] ?? '#4B5563';
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color, backgroundColor: color + '20', border: `1px solid ${color}40` }}>
      {status.replace('_', ' ')}
    </span>
  );
}

const EMPTY_APP = { company: '', role: '', status: 'applied', applied_date: '', notes: '' };

// ── Main Page ──────────────────────────────────────────────────────────────

export default function RolesPage() {
  const [tab, setTab] = useState('positions');

  // ── Positions state ──
  const [positions, setPositions] = useState([]);
  const [showAddPos, setShowAddPos] = useState(false);
  const [posForm, setPosForm] = useState({ name: '', company: '', title: '', role_type: 'ft', compensation_type: 'salary', compensation_rate: '', pay_frequency: 'biweekly', start_date: '' });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [selectedPos, setSelectedPos] = useState(null);
  const [entries, setEntries] = useState([]);
  const [entryForm, setEntryForm] = useState({ entry_date: '', hours: '', amount: '', description: '' });
  const [error, setError] = useState('');

  // ── Pipeline state ──
  const [jobs, setJobs] = useState([]);
  const [appForm, setAppForm] = useState(EMPTY_APP);
  const [appSaving, setAppSaving] = useState(false);
  const [appError, setAppError] = useState('');

  const loadPositions = useCallback(async () => {
    const r = await api.get('/metrics/income-streams?type=role');
    if (r.ok) setPositions(await r.json());
  }, []);

  const loadEntries = useCallback(async (streamId) => {
    if (!streamId) { setEntries([]); return; }
    const r = await api.get(`/metrics/income-entries?stream_id=${streamId}`);
    if (r.ok) setEntries(await r.json());
  }, []);

  const loadJobs = useCallback(async () => {
    const r = await api.get('/metrics/job-activities?limit=500');
    if (r.ok) setJobs(await r.json());
  }, []);

  useEffect(() => { loadPositions(); loadJobs(); }, [loadPositions, loadJobs]);
  useEffect(() => { loadEntries(selectedPos); }, [selectedPos, loadEntries]);

  // ── Position handlers ──
  async function handleAddPos(e) {
    e.preventDefault();
    setError('');
    const body = {
      ...posForm, stream_type: 'role',
      compensation_rate: posForm.compensation_rate ? Number(posForm.compensation_rate) : null,
      start_date: posForm.start_date || null,
    };
    const r = await api.post('/metrics/income-streams', body);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setPosForm({ name: '', company: '', title: '', role_type: 'ft', compensation_type: 'salary', compensation_rate: '', pay_frequency: 'biweekly', start_date: '' });
    setShowAddPos(false);
    loadPositions();
  }

  async function handleSaveEdit(id) {
    const body = {
      ...editForm,
      compensation_rate: editForm.compensation_rate ? Number(editForm.compensation_rate) : null,
    };
    await api.put(`/metrics/income-streams/${id}`, body);
    setEditing(null);
    loadPositions();
  }

  async function handleDeletePos(id) {
    if (!window.confirm('Delete this position?')) return;
    await api.delete(`/metrics/income-streams/${id}`);
    if (selectedPos === id) setSelectedPos(null);
    loadPositions();
  }

  // ── Entry handlers ──
  async function handleAddEntry(e) {
    e.preventDefault();
    if (!selectedPos) return;
    setError('');
    const body = {
      income_stream_id: selectedPos,
      entry_date: entryForm.entry_date,
      hours: entryForm.hours ? Number(entryForm.hours) : null,
      amount: entryForm.amount ? Number(entryForm.amount) : null,
      description: entryForm.description || null,
    };
    const r = await api.post('/metrics/income-entries', body);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setEntryForm({ entry_date: '', hours: '', amount: '', description: '' });
    loadEntries(selectedPos);
  }

  async function handleDeleteEntry(id) {
    await api.delete(`/metrics/income-entries/${id}`);
    loadEntries(selectedPos);
  }

  // ── Pipeline handlers ──
  async function handleSubmitApp(e) {
    e.preventDefault();
    setAppError('');
    setAppSaving(true);
    try {
      const body = { ...appForm, applied_date: appForm.applied_date || null, notes: appForm.notes || null };
      const r = await api.post('/metrics/job-activities', body);
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || 'Save failed'); }
      setAppForm(EMPTY_APP);
      await loadJobs();
    } catch (err) { setAppError(err.message); }
    finally { setAppSaving(false); }
  }

  async function handleDeleteApp(id) {
    await api.delete(`/metrics/job-activities/${id}`);
    await loadJobs();
  }

  const roleLabel = (rt) => ROLE_TYPES.find((r) => r.value === rt)?.label || rt;
  const compLabel = (ct) => COMP_TYPES.find((c) => c.value === ct)?.label || ct;

  const totalEntryAmt = entries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalEntryHrs = entries.reduce((s, e) => s + (e.hours || 0), 0);

  return (
    <div className="max-w-3xl xl:max-w-5xl space-y-5">
      <h1 className="page-title">Roles</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-obsidian-700">
        {[['positions', 'Active Positions'], ['pipeline', 'Pipeline']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === id ? 'border-arc text-arc' : 'border-transparent text-ink-400 hover:text-ink-200'
            }`}>{label}</button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {/* ────── Active Positions Tab ────── */}
      {tab === 'positions' && (
        <div className="max-w-3xl xl:max-w-5xl space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink-100">Positions</h2>
              <p className="text-xs text-ink-500 mt-0.5">{positions.length} position{positions.length !== 1 && 's'} tracked</p>
            </div>
            <button onClick={() => setShowAddPos(true)} className="btn-primary text-xs gap-1.5">
              <Plus size={12} /> Add Position
            </button>
          </div>

          {/* Add form */}
          {showAddPos && (
            <div className="metal-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-ink-100">New Position</h3>
              <form onSubmit={handleAddPos} className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Name</label>
                    <input type="text" required maxLength={128} className="arc-input text-sm font-light"
                      placeholder="Senior Dev at Acme" value={posForm.name} onChange={(e) => setPosForm({ ...posForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Company</label>
                    <input type="text" maxLength={128} className="arc-input text-sm font-light"
                      placeholder="Acme Corp" value={posForm.company} onChange={(e) => setPosForm({ ...posForm, company: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Title</label>
                    <input type="text" maxLength={128} className="arc-input text-sm font-light"
                      placeholder="Senior Developer" value={posForm.title} onChange={(e) => setPosForm({ ...posForm, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Type</label>
                    <select className="arc-input text-sm font-light" value={posForm.role_type}
                      onChange={(e) => setPosForm({ ...posForm, role_type: e.target.value })}>
                      {ROLE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Compensation</label>
                    <select className="arc-input text-sm font-light" value={posForm.compensation_type}
                      onChange={(e) => setPosForm({ ...posForm, compensation_type: e.target.value })}>
                      {COMP_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Rate / Salary</label>
                    <input type="number" step="0.01" min="0" className="arc-input text-sm font-light font-mono"
                      placeholder="$0.00" value={posForm.compensation_rate} onChange={(e) => setPosForm({ ...posForm, compensation_rate: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Pay Frequency</label>
                    <select className="arc-input text-sm font-light" value={posForm.pay_frequency}
                      onChange={(e) => setPosForm({ ...posForm, pay_frequency: e.target.value })}>
                      {PAY_FREQS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Start Date</label>
                    <input type="date" className="arc-input text-sm font-light"
                      value={posForm.start_date} onChange={(e) => setPosForm({ ...posForm, start_date: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowAddPos(false)} className="btn-ghost text-xs">Cancel</button>
                  <button type="submit" className="btn-primary text-xs">Create</button>
                </div>
              </form>
            </div>
          )}

          {/* Position list */}
          {positions.length === 0 && !showAddPos && (
            <div className="metal-card px-6 py-8 text-center">
              <p className="text-ink-400 text-sm">No positions tracked yet.</p>
              <p className="text-ink-500 text-xs mt-1">Add your FT job, contract gig, or IC role.</p>
            </div>
          )}

          {positions.length > 0 && (
            <div className="metal-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-obsidian-600">
                    <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Position</th>
                    <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Type</th>
                    <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Compensation</th>
                    <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const isEditing = editing === p.id;
                    const isSelected = selectedPos === p.id;
                    return (
                      <tr key={p.id}
                        onClick={() => !isEditing && setSelectedPos(isSelected ? null : p.id)}
                        className={`border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors cursor-pointer ${
                          isSelected ? 'bg-arc/5 border-l-2 border-l-arc' : ''
                        } ${p.status !== 'active' ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="space-y-1">
                              <input type="text" className="arc-input text-xs font-light py-1 w-full" placeholder="Company"
                                value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                                onClick={(e) => e.stopPropagation()} />
                              <input type="text" className="arc-input text-xs font-light py-1 w-full" placeholder="Title"
                                value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                onClick={(e) => e.stopPropagation()} />
                            </div>
                          ) : (
                            <>
                              <p className="text-ink-100">{p.company ? `${p.company}` : p.name}</p>
                              <p className="text-[9px] text-ink-500">{p.title || p.name}{p.start_date ? ` · since ${p.start_date}` : ''}</p>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isEditing ? (
                            <select className="arc-input text-[10px] font-light py-1" value={editForm.role_type}
                              onChange={(e) => setEditForm({ ...editForm, role_type: e.target.value })}
                              onClick={(e) => e.stopPropagation()}>
                              {ROLE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          ) : (
                            <span className="text-[10px] text-ink-400">{roleLabel(p.role_type)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <input type="number" step="0.01" min="0" className="arc-input text-xs font-light font-mono py-1 w-24 text-right"
                              value={editForm.compensation_rate} onChange={(e) => setEditForm({ ...editForm, compensation_rate: e.target.value })}
                              onClick={(e) => e.stopPropagation()} />
                          ) : (
                            <span className="font-normal font-mono text-ink-300">
                              {p.compensation_rate ? formatCurrency(p.compensation_rate) : '—'}
                              {p.compensation_rate && <span className="text-[9px] text-ink-500 ml-1">{compLabel(p.compensation_type)}</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            p.status === 'active' ? 'bg-success/15 text-success border border-success/30'
                              : p.status === 'paused' ? 'bg-ember/15 text-ember border border-ember/30'
                              : 'bg-obsidian-700 text-ink-500'
                          }`}>{p.status}</span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <button onClick={() => handleSaveEdit(p.id)} className="text-arc hover:text-ink-50 p-0.5"><Check size={12} /></button>
                                <button onClick={() => setEditing(null)} className="text-ink-400 hover:text-ink-50 p-0.5"><X size={12} /></button>
                              </>
                            ) : (
                              <button onClick={() => {
                                setEditing(p.id);
                                setEditForm({ company: p.company || '', title: p.title || '', role_type: p.role_type || 'ft', compensation_rate: p.compensation_rate || '', status: p.status });
                              }} className="text-ink-400 hover:text-ink-50 p-0.5"><Pencil size={12} /></button>
                            )}
                            <button onClick={() => handleDeletePos(p.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors">
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

          {/* Income entries for selected position */}
          {selectedPos && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink-100">Income Log</h3>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {entries.length} entries · {formatCurrency(totalEntryAmt)} total · {totalEntryHrs.toFixed(1)}h logged
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
                      placeholder="8" value={entryForm.hours} onChange={(e) => setEntryForm({ ...entryForm, hours: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Amount</label>
                    <input type="number" step="0.01" min="0" className="arc-input text-xs font-light font-mono py-1 w-24"
                      placeholder="$0.00" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Description</label>
                    <input type="text" maxLength={256} className="arc-input text-xs font-light py-1 w-full"
                      placeholder="Pay period, bonus, etc." value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} />
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
      )}

      {/* ────── Pipeline Tab ────── */}
      {tab === 'pipeline' && (
        <div className="max-w-3xl xl:max-w-5xl space-y-5">
          {jobs.length > 0 && (
            <div className="metal-card p-4">
              <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide mb-3">Applications by status</p>
              <div className="max-w-lg">
                <StatusChart jobs={jobs} />
              </div>
            </div>
          )}

          <div className="metal-card p-5">
            <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide mb-4">Log an application</p>
            {appError && (
              <div className="flex items-center gap-2 text-error text-sm mb-3">
                <AlertCircle size={14} /> {appError}
              </div>
            )}
            <form onSubmit={handleSubmitApp} className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Company</label>
                <input type="text" className="arc-input text-sm font-light" required placeholder="Acme Corp"
                  value={appForm.company} onChange={(e) => setAppForm({ ...appForm, company: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Role</label>
                <input type="text" className="arc-input text-sm font-light" required placeholder="Software Engineer"
                  value={appForm.role} onChange={(e) => setAppForm({ ...appForm, role: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Status</label>
                <select className="arc-input text-sm font-light"
                  value={appForm.status} onChange={(e) => setAppForm({ ...appForm, status: e.target.value })}>
                  {APP_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Applied Date</label>
                <input type="date" className="arc-input text-sm font-light"
                  value={appForm.applied_date} onChange={(e) => setAppForm({ ...appForm, applied_date: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Notes</label>
                <input type="text" className="arc-input text-sm font-light" placeholder="Referral from…"
                  value={appForm.notes} onChange={(e) => setAppForm({ ...appForm, notes: e.target.value })} />
              </div>
              <div className="col-span-2 md:col-span-3 flex justify-end pt-1">
                <button type="submit" disabled={appSaving} className="btn-primary text-xs gap-1.5">
                  <Plus size={14} /> {appSaving ? 'Saving…' : 'Add application'}
                </button>
              </div>
            </form>
          </div>

          {jobs.length > 0 && (
            <div className="metal-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-obsidian-600">
                    {['Company', 'Role', 'Status', 'Applied', 'Notes', ''].map((h) => (
                      <th key={h} className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...jobs].sort((a, b) => (b.applied_date ?? '').localeCompare(a.applied_date ?? '')).map((j) => (
                    <tr key={j.id} className="border-b border-obsidian-600/50 hover:bg-obsidian-700/30 transition-colors">
                      <td className="px-4 py-3 text-ink-100">{j.company}</td>
                      <td className="px-4 py-3 text-ink-200">{j.role}</td>
                      <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                      <td className="px-4 py-3 text-ink-300">{formatDate(j.applied_date)}</td>
                      <td className="px-4 py-3 text-ink-300 max-w-xs truncate">{j.notes ?? '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDeleteApp(j.id)} className="text-ink-400 hover:text-error transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {jobs.length === 0 && (
            <div className="metal-card px-6 py-8 text-center">
              <p className="text-ink-400 text-sm">No applications tracked yet.</p>
              <p className="text-ink-500 text-xs mt-1">Log your job applications to track your pipeline.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
