import { useEffect, useState, useCallback } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/utils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const STATUSES = ['applied', 'phone_screen', 'interview', 'offer', 'rejected', 'withdrawn'];
const STATUS_COLORS = {
  applied:      '#00D4FF',
  phone_screen: '#FFB020',
  interview:    '#8B5CF6',
  offer:        '#10B981',
  rejected:     '#EF4444',
  withdrawn:    '#4B5563',
};

const EMPTY_FORM = { company: '', role: '', status: 'applied', applied_date: '', notes: '' };

function StatusChart({ jobs }) {
  const counts = STATUSES.map((s) => jobs.filter((j) => j.status === s).length);
  const data = {
    labels: STATUSES.map((s) => s.replace('_', ' ')),
    datasets: [{
      data: counts,
      backgroundColor: STATUSES.map((s) => STATUS_COLORS[s] + '33'),
      borderColor: STATUSES.map((s) => STATUS_COLORS[s]),
      borderWidth: 2,
      borderRadius: 4,
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
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color, backgroundColor: color + '20', border: `1px solid ${color}40` }}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

export default function JobsPage() {
  const [jobs, setJobs]     = useState([]);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    const r = await api.get('/metrics/job-activities?limit=500');
    if (r.ok) setJobs(await r.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        company:      form.company,
        role:         form.role,
        status:       form.status,
        applied_date: form.applied_date || null,
        notes:        form.notes || null,
      };
      const r = await api.post('/metrics/job-activities', body);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || 'Save failed');
      }
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    await api.delete(`/metrics/job-activities/${id}`);
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title">Job Search</h1>

      {jobs.length > 0 && (
        <div className="metal-card p-4">
          <p className="section-label mb-3">Applications by status</p>
          <div className="max-w-lg">
            <StatusChart jobs={jobs} />
          </div>
        </div>
      )}

      <div className="metal-card p-5">
        <p className="section-label mb-4">Log an application</p>
        {error && (
          <div className="flex items-center gap-2 text-error text-sm mb-3">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="section-label block mb-1">Company</label>
            <input type="text" className="arc-input" required placeholder="Acme Corp"
              value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Role</label>
            <input type="text" className="arc-input" required placeholder="Software Engineer"
              value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Status</label>
            <select className="arc-input"
              value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1">Applied date</label>
            <input type="date" className="arc-input"
              value={form.applied_date} onChange={(e) => setForm({ ...form, applied_date: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="section-label block mb-1">Notes</label>
            <input type="text" className="arc-input" placeholder="Referral from…"
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="col-span-2 md:col-span-3 flex justify-end pt-1">
            <button type="submit" disabled={saving} className="btn-primary">
              <Plus size={14} /> {saving ? 'Saving…' : 'Add application'}
            </button>
          </div>
        </form>
      </div>

      {jobs.length > 0 && (
        <div className="metal-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                {['Company','Role','Status','Applied','Notes',''].map((h) => (
                  <th key={h} className="text-left section-label px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...jobs].sort((a, b) => (b.applied_date ?? '').localeCompare(a.applied_date ?? '')).map((j) => (
                <tr key={j.id} className="border-b border-obsidian-600/50 hover:bg-obsidian-700/30 transition-colors">
                  <td className="px-4 py-3 text-ink-50 font-medium">{j.company}</td>
                  <td className="px-4 py-3 text-ink-200">{j.role}</td>
                  <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                  <td className="px-4 py-3 text-ink-300">{formatDate(j.applied_date)}</td>
                  <td className="px-4 py-3 text-ink-300 max-w-xs truncate">{j.notes ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(j.id)}
                      className="text-ink-400 hover:text-error transition-colors">
                      <Trash2 size={14} />
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
