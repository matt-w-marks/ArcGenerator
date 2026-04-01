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

const EMPTY_FORM = {
  snapshot_date: '', bankroll: '', monthly_income_target: '',
  weekly_expenses: '', debt_total: '', notes: '',
};

function BankrollChart({ snapshots }) {
  const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)).slice(-30);
  const data = {
    labels: sorted.map((s) => formatDate(s.snapshot_date)),
    datasets: [
      {
        label: 'Bankroll ($)',
        data: sorted.map((s) => Number(s.bankroll)),
        borderColor: '#10B981',
        backgroundColor: 'rgba(16,185,129,0.08)',
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

export default function FinancesPage() {
  const [snapshots, setSnapshots] = useState([]);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    const r = await api.get('/metrics/financial-snapshots?limit=200');
    if (r.ok) setSnapshots(await r.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        snapshot_date:          form.snapshot_date,
        bankroll:               Number(form.bankroll),
        monthly_income_target:  Number(form.monthly_income_target),
        weekly_expenses:        Number(form.weekly_expenses),
        debt_total:             form.debt_total ? Number(form.debt_total) : 0,
        notes:                  form.notes || null,
      };
      const r = await api.post('/metrics/financial-snapshots', body);
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
    await api.delete(`/metrics/financial-snapshots/${id}`);
    await load();
  }

  const latest = snapshots.length > 0
    ? [...snapshots].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0]
    : null;

  return (
    <div className="space-y-6">
      <h1 className="page-title">Finances</h1>

      {latest && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card">
            <p className="section-label mb-1">Bankroll</p>
            <p className="text-2xl font-bold font-display text-success">{formatCurrency(latest.bankroll)}</p>
          </div>
          <div className="stat-card">
            <p className="section-label mb-1">Runway</p>
            <p className="text-2xl font-bold font-display text-arc">{round1(latest.runway_weeks)}w</p>
            <p className="text-xs text-ink-300 mt-0.5">{formatCurrency(latest.weekly_expenses)}/wk expenses</p>
          </div>
          <div className="stat-card">
            <p className="section-label mb-1">Debt Total</p>
            <p className="text-2xl font-bold font-display text-ember">{formatCurrency(latest.debt_total ?? 0)}</p>
            <p className="text-xs text-ink-300 mt-0.5">Target: {formatCurrency(latest.monthly_income_target)}/mo</p>
          </div>
        </div>
      )}

      {snapshots.length > 0 && (
        <div className="metal-card p-4">
          <p className="section-label mb-3">Bankroll over time</p>
          <BankrollChart snapshots={snapshots} />
        </div>
      )}

      <div className="metal-card p-5">
        <p className="section-label mb-4">Add a snapshot</p>
        {error && (
          <div className="flex items-center gap-2 text-error text-sm mb-3">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="section-label block mb-1">Date</label>
            <input type="date" className="arc-input" required
              value={form.snapshot_date} onChange={(e) => setForm({ ...form, snapshot_date: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Bankroll ($)</label>
            <input type="number" step="0.01" min="0" className="arc-input" required placeholder="5000.00"
              value={form.bankroll} onChange={(e) => setForm({ ...form, bankroll: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Monthly target ($)</label>
            <input type="number" step="0.01" min="0" className="arc-input" required placeholder="4000.00"
              value={form.monthly_income_target} onChange={(e) => setForm({ ...form, monthly_income_target: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Weekly expenses ($)</label>
            <input type="number" step="0.01" min="0.01" className="arc-input" required placeholder="600.00"
              value={form.weekly_expenses} onChange={(e) => setForm({ ...form, weekly_expenses: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Debt total ($)</label>
            <input type="number" step="0.01" min="0" className="arc-input" placeholder="12000.00"
              value={form.debt_total} onChange={(e) => setForm({ ...form, debt_total: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Notes</label>
            <input type="text" className="arc-input" placeholder="Optional"
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="col-span-2 md:col-span-3 flex justify-end pt-1">
            <button type="submit" disabled={saving} className="btn-primary">
              <Plus size={14} /> {saving ? 'Saving…' : 'Add snapshot'}
            </button>
          </div>
        </form>
      </div>

      {snapshots.length > 0 && (
        <div className="metal-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                {['Date','Bankroll','Target/mo','Expenses/wk','Runway','Debt','Notes',''].map((h) => (
                  <th key={h} className="text-left section-label px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...snapshots].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date)).map((s) => (
                <tr key={s.id} className="border-b border-obsidian-600/50 hover:bg-obsidian-700/30 transition-colors">
                  <td className="px-4 py-3 text-ink-50">{formatDate(s.snapshot_date)}</td>
                  <td className="px-4 py-3 text-success font-medium">{formatCurrency(s.bankroll)}</td>
                  <td className="px-4 py-3 text-ink-200">{formatCurrency(s.monthly_income_target)}</td>
                  <td className="px-4 py-3 text-ink-200">{formatCurrency(s.weekly_expenses)}</td>
                  <td className="px-4 py-3 text-arc">{round1(s.runway_weeks)}w</td>
                  <td className="px-4 py-3 text-ember">{formatCurrency(s.debt_total ?? 0)}</td>
                  <td className="px-4 py-3 text-ink-300 max-w-xs truncate">{s.notes ?? '—'}</td>
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
