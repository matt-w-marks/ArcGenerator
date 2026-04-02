import { useEffect, useState } from 'react';
import { Car, Briefcase, DollarSign, TrendingUp, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, round1 } from '../lib/utils';

function StatCard({ icon: Icon, color, label, value, sub }) {
  const colorMap = {
    arc:    'text-arc bg-arc/10',
    ember:  'text-ember bg-ember/10',
    neural: 'text-neural bg-neural/10',
    success:'text-success bg-success/10',
  };
  return (
    <div className="stat-card flex items-start gap-4">
      <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${colorMap[color]}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="section-label mb-0.5">{label}</p>
        <p className="text-2xl font-bold font-display text-ink-50">{value}</p>
        {sub && <p className="text-xs text-ink-300 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats]   = useState(null);
  const [error, setError]   = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [sessRes, jobRes, snapRes] = await Promise.all([
          api.get('/metrics/driving-sessions?limit=100'),
          api.get('/metrics/job-activities?limit=100'),
          api.get('/metrics/financial-snapshots?limit=1'),
        ]);
        const sessions  = sessRes.ok  ? await sessRes.json()  : [];
        const jobs      = jobRes.ok   ? await jobRes.json()   : [];
        const snapshots = snapRes.ok  ? await snapRes.json()  : [];

        const totalEarnings = sessions.reduce((s, r) => s + Number(r.gross_earnings), 0);
        const totalHours    = sessions.reduce((s, r) => s + Number(r.duration_hours ?? 0), 0);
        const totalTrips    = sessions.reduce((s, r) => s + Number(r.trip_count), 0);
        const activeApps    = jobs.filter((j) => j.status === 'applied' || j.status === 'interview').length;
        const latestSnap    = snapshots[0];

        setStats({ totalEarnings, totalHours, totalTrips, activeApps, latestSnap });
      } catch {
        setError('Failed to load dashboard data.');
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2 text-error text-sm">
        <AlertCircle size={16} />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-ink-300 text-sm mt-1">Your rideshare &amp; job search overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          color="arc"
          label="Total Earnings"
          value={stats ? formatCurrency(stats.totalEarnings) : '—'}
          sub={stats ? `${round1(stats.totalHours)}h worked` : undefined}
        />
        <StatCard
          icon={Car}
          color="ember"
          label="Total Trips"
          value={stats ? stats.totalTrips.toLocaleString() : '—'}
          sub={stats ? (stats.totalHours > 0 ? `${round1(stats.totalTrips / stats.totalHours)} trips/hr avg` : undefined) : undefined}
        />
        <StatCard
          icon={Briefcase}
          color="neural"
          label="Active Applications"
          value={stats ? stats.activeApps : '—'}
          sub="applied + interview"
        />
        <StatCard
          icon={TrendingUp}
          color="success"
          label="Bankroll"
          value={stats?.latestSnap ? formatCurrency(stats.latestSnap.bankroll) : '—'}
          sub={stats?.latestSnap ? `${round1(stats.latestSnap.runway_weeks)}w runway` : undefined}
        />
      </div>

      {!stats && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-arc border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  );
}
