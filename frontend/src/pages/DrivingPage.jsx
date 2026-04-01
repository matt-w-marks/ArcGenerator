import { useEffect, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDate, round1 } from '../lib/utils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const EMPTY_FORM = { date: '', hours_worked: '', gross_earnings: '', gas_cost: '', trip_count: '', zone: '' };

function LineChart({ sessions }) {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  const data = {
    labels: sorted.map((s) => formatDate(s.date)),
    datasets: [
      {
        label: 'Earnings ($)',
        data: sorted.map((s) => Number(s.gross_earnings)),
        borderColor: '#00D4FF',
        backgroundColor: 'rgba(0,212,255,0.08)',
        borderWidth: 2,
        pointRadius: 3,
        fill: true,
        tension: 0.3,
      },
    ],
  };
  const options = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#6B7280', maxTicksLimit: 8 }, grid: { color: 'rgba(42,51,66,0.6)' } },
      y: { ticks: { color: '#6B7280' }, grid: { color: 'rgba(42,51,66,0.6)' } },
    },
  };
  return <Line data={data} options={options} />;
}

export default function DrivingPage() {
  const [sessions, setSessions] = useState([]);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    const r = await api.get('/metrics/driving-sessions?limit=200');
    if (r.ok) setSessions(await r.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        date:           form.date,
        hours_worked:   Number(form.hours_worked),
        gross_earnings: Number(form.gross_earnings),
        gas_cost:       Number(form.gas_cost || 0),
        trip_count:     Number(form.trip_count || 0),
        zone:           form.zone || null,
      };
      const r = await api.post('/metrics/driving-sessions', body);
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
    await api.delete(`/metrics/driving-sessions/${id}`);
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title">Driving Sessions</h1>

      {sessions.length > 0 && (
        <div className="metal-card p-4">
          <p className="section-label mb-3">Earnings — last 30 sessions</p>
          <LineChart sessions={sessions} />
        </div>
      )}

      {/* Add form */}
      <div className="metal-card p-5">
        <p className="section-label mb-4">Log a session</p>
        {error && (
          <div className="flex items-center gap-2 text-error text-sm mb-3">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="col-span-2 md:col-span-1">
            <label className="section-label block mb-1">Date</label>
            <input type="date" className="arc-input" required
              value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Hours</label>
            <input type="number" step="0.1" min="0.1" className="arc-input" required placeholder="6.5"
              value={form.hours_worked} onChange={(e) => setForm({ ...form, hours_worked: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Gross ($)</label>
            <input type="number" step="0.01" min="0" className="arc-input" required placeholder="120.00"
              value={form.gross_earnings} onChange={(e) => setForm({ ...form, gross_earnings: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Gas ($)</label>
            <input type="number" step="0.01" min="0" className="arc-input" placeholder="18.00"
              value={form.gas_cost} onChange={(e) => setForm({ ...form, gas_cost: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Trips</label>
            <input type="number" min="0" className="arc-input" placeholder="22"
              value={form.trip_count} onChange={(e) => setForm({ ...form, trip_count: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Zone</label>
            <input type="text" className="arc-input" placeholder="Downtown"
              value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
          </div>
          <div className="col-span-2 md:col-span-3 flex justify-end pt-1">
            <button type="submit" disabled={saving} className="btn-primary">
              <Plus size={14} />
              {saving ? 'Saving…' : 'Add session'}
            </button>
          </div>
        </form>
      </div>

      {/* Table */}
      {sessions.length > 0 && (
        <div className="metal-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                {['Date','Hours','Gross','Gas','Net','Trips','Zone',''].map((h) => (
                  <th key={h} className="text-left section-label px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...sessions].sort((a, b) => b.date.localeCompare(a.date)).map((s) => (
                <tr key={s.id} className="border-b border-obsidian-600/50 hover:bg-obsidian-700/30 transition-colors">
                  <td className="px-4 py-3 text-ink-50">{formatDate(s.date)}</td>
                  <td className="px-4 py-3 text-ink-200">{round1(s.hours_worked)}h</td>
                  <td className="px-4 py-3 text-arc">{formatCurrency(s.gross_earnings)}</td>
                  <td className="px-4 py-3 text-ink-300">{formatCurrency(s.gas_cost)}</td>
                  <td className="px-4 py-3 text-success">{formatCurrency(s.gross_earnings - s.gas_cost)}</td>
                  <td className="px-4 py-3 text-ink-200">{s.trip_count}</td>
                  <td className="px-4 py-3 text-ink-300">{s.zone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(s.id)}
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
