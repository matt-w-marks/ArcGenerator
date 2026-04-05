import { useEffect, useState, useCallback } from 'react';
import { format, subDays, startOfMonth, startOfWeek } from 'date-fns';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { AlertCircle, TrendingUp, Fuel, Clock, DollarSign, Car, Briefcase, Target } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, round1 } from '../lib/utils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const CHART_OPTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(100,116,139,0.1)' } },
    y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(100,116,139,0.1)' } },
  },
};
const DONUT_OPTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 }, padding: 8 } } },
};

function ds(d) { return format(d, 'yyyy-MM-dd'); }

// ── Stat card ────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, color }) {
  return (
    <div className="metal-card px-3 py-2.5">
      <p className="text-[9px] text-ink-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold font-mono ${color || 'text-ink-100'}`}>{value}</p>
      {sub && <p className="text-[10px] text-ink-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [range, setRange] = useState('today');
  const [summary, setSummary] = useState(null);
  const [byDay, setByDay] = useState([]);
  const [byZone, setByZone] = useState([]);
  const [byPlatform, setByPlatform] = useState([]);
  const [expenses, setExpenses] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [jobSearch, setJobSearch] = useState(null);
  const [taxSummary, setTaxSummary] = useState(null);
  const [error, setError] = useState('');

  const getRange = useCallback(() => {
    const today = new Date();
    if (range === 'today') return { from: ds(today), to: ds(today) };
    if (range === 'week') return { from: ds(startOfWeek(today, { weekStartsOn: 1 })), to: ds(today) };
    if (range === 'month') return { from: ds(startOfMonth(today)), to: ds(today) };
    return { from: ds(subDays(today, 6)), to: ds(today) };
  }, [range]);

  const load = useCallback(async () => {
    const { from, to } = getRange();
    const q = `from=${from}&to=${to}`;
    const [sRes, dRes, zRes, pRes, eRes, wRes, fRes, jRes, tRes] = await Promise.all([
      api.get(`/metrics/reports/summary?${q}`),
      api.get(`/metrics/reports/by-day?${q}`),
      api.get(`/metrics/reports/by-zone?${q}`),
      api.get(`/metrics/reports/by-platform?${q}`),
      api.get(`/metrics/reports/expenses?${q}`),
      api.get('/metrics/reports/weekly'),
      api.get('/metrics/reports/financial-health'),
      api.get('/metrics/reports/job-search'),
      api.get('/metrics/reports/tax-summary'),
    ]);
    if (sRes.ok) setSummary(await sRes.json());
    if (dRes.ok) setByDay(await dRes.json());
    if (zRes.ok) setByZone(await zRes.json());
    if (pRes.ok) setByPlatform(await pRes.json());
    if (eRes.ok) setExpenses(await eRes.json());
    if (wRes.ok) setWeekly(await wRes.json());
    if (fRes.ok) setFinancial(await fRes.json());
    if (jRes.ok) setJobSearch(await jRes.json());
    if (tRes.ok) setTaxSummary(await tRes.json());
  }, [getRange]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="flex items-center gap-2 text-error text-sm p-8"><AlertCircle size={16} /> {error}</div>;

  const tripPct = weekly ? Math.min(100, Math.round(weekly.trips_this_week / weekly.trips_target * 100)) : 0;
  const runwayColor = financial ? (financial.runway_days >= 60 ? 'text-success' : financial.runway_days >= 30 ? 'text-ember' : 'text-error') : '';

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header + range picker */}
      <div className="flex items-center justify-between">
        <h1 className="page-title">Reports</h1>
        <div className="flex gap-1">
          {[['today', 'Today'], ['week', '7D'], ['month', 'MTD']].map(([k, label]) => (
            <button key={k} onClick={() => setRange(k)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${range === k ? 'border-arc/40 bg-arc/10 text-arc' : 'border-obsidian-600 text-ink-400 hover:text-ink-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ROW 1 — Hero metrics */}
      {summary && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <Stat label="Gross" value={formatCurrency(summary.total_gross)} />
          <Stat label="Net" value={formatCurrency(summary.total_net)} color={summary.total_net >= 0 ? 'text-success' : 'text-error'} />
          <Stat label="$/hr" value={`$${summary.avg_per_hour}`} />
          <Stat label="$/mile" value={`$${summary.avg_per_mile}`} />
          <Stat label="Trips" value={summary.total_trips} />
          <Stat label="Hours" value={`${summary.total_active_hours}h`} />
        </div>
      )}

      {/* ROW 2 — Compliance + Financial Health */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Hertz trip counter */}
        {weekly && (
          <div className="metal-card px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Target size={14} className="text-arc" />
              <span className="text-xs font-semibold text-ink-100">Hertz 30-Trip</span>
              <span className={`ml-auto text-sm font-bold font-mono ${tripPct >= 100 ? 'text-success' : 'text-ink-100'}`}>
                {weekly.trips_this_week}/{weekly.trips_target}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-obsidian-700 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${tripPct >= 100 ? 'bg-success' : 'bg-arc'}`} style={{ width: `${tripPct}%` }} />
            </div>
          </div>
        )}
        {/* Bankroll */}
        {financial && (
          <div className="metal-card px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={14} className="text-success" />
              <span className="text-xs font-semibold text-ink-100">Bankroll</span>
            </div>
            <p className="text-lg font-bold font-mono text-ink-100">{formatCurrency(financial.bankroll_remaining)}</p>
            <p className={`text-[10px] ${runwayColor}`}>{round1(financial.runway_days)} days runway</p>
          </div>
        )}
        {/* SE Tax */}
        {financial && (
          <div className="metal-card px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={14} className="text-ember" />
              <span className="text-xs font-semibold text-ink-100">SE Tax Accrued</span>
            </div>
            <p className="text-lg font-bold font-mono text-ember">{formatCurrency(financial.se_tax_accrued)}</p>
            <p className="text-[10px] text-ink-500">{(financial.se_tax_rate * 100).toFixed(1)}% of gross — do not touch</p>
          </div>
        )}
      </div>

      {/* ROW 3 — Danger indicators */}
      {financial && expenses && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Breakeven $/hr" value={`$${financial.breakeven_per_hour}`}
            color={summary && summary.avg_per_hour > 0 && summary.avg_per_hour < financial.breakeven_per_hour ? 'text-error' : 'text-success'}
            sub={`Min to cover costs`} />
          <Stat label="Gas % of Gross" value={`${expenses.gas_pct_of_gross}%`}
            color={expenses.gas_pct_of_gross > 12 ? 'text-error' : 'text-ink-100'}
            sub={expenses.gas_pct_of_gross > 12 ? 'Above 12% threshold' : 'Within target'} />
          <Stat label="Plan vs Actual" value={summary ? formatCurrency(summary.variance) : '$0'}
            color={summary && summary.variance >= 0 ? 'text-success' : 'text-error'}
            sub={summary ? `${summary.days_worked} days logged` : ''} />
        </div>
      )}

      {/* ROW 4 — Trend charts */}
      {byDay.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="metal-card p-4">
            <p className="text-xs font-semibold text-ink-100 mb-3">Daily Net</p>
            <div style={{ height: 180 }}>
              <Line data={{
                labels: byDay.map((d) => format(new Date(d.date + 'T00:00'), 'M/d')),
                datasets: [{
                  data: byDay.map((d) => d.net),
                  borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.1)',
                  fill: true, tension: 0.3, pointRadius: 3,
                }],
              }} options={CHART_OPTS} />
            </div>
          </div>
          <div className="metal-card p-4">
            <p className="text-xs font-semibold text-ink-100 mb-3">Planned vs Actual</p>
            <div style={{ height: 180 }}>
              <Bar data={{
                labels: byDay.map((d) => format(new Date(d.date + 'T00:00'), 'M/d')),
                datasets: [
                  { label: 'Actual', data: byDay.map((d) => d.gross), backgroundColor: 'rgba(56,189,248,0.6)' },
                ],
              }} options={CHART_OPTS} />
            </div>
          </div>
        </div>
      )}

      {/* ROW 5 — Breakdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Platform mix */}
        {byPlatform.length > 0 && (
          <div className="metal-card p-4">
            <p className="text-xs font-semibold text-ink-100 mb-3">Platform Mix</p>
            <div style={{ height: 180 }}>
              <Doughnut data={{
                labels: byPlatform.map((p) => p.platform_name),
                datasets: [{
                  data: byPlatform.map((p) => p.total_earnings),
                  backgroundColor: byPlatform.map((p) => p.platform_color || '#6b7280'),
                }],
              }} options={DONUT_OPTS} />
            </div>
          </div>
        )}
        {/* Expense breakdown */}
        {expenses && expenses.by_category.length > 0 && (
          <div className="metal-card p-4">
            <p className="text-xs font-semibold text-ink-100 mb-3">Expenses</p>
            <div style={{ height: 180 }}>
              <Doughnut data={{
                labels: expenses.by_category.map((c) => c.category.replace('_', ' ')),
                datasets: [{
                  data: expenses.by_category.map((c) => c.total),
                  backgroundColor: ['#f97316', '#8b5cf6', '#06b6d4', '#ec4899', '#22c55e', '#6b7280'],
                }],
              }} options={DONUT_OPTS} />
            </div>
          </div>
        )}
        {/* Zone performance */}
        {byZone.length > 0 && (
          <div className="metal-card p-4">
            <p className="text-xs font-semibold text-ink-100 mb-3">Zone $/hr</p>
            <div style={{ height: 180 }}>
              <Bar data={{
                labels: byZone.slice(0, 8).map((z) => z.zone_name?.split('—')[0]?.trim()?.slice(0, 12) || '?'),
                datasets: [{
                  data: byZone.slice(0, 8).map((z) => z.per_hour),
                  backgroundColor: 'rgba(56,189,248,0.5)',
                }],
              }} options={{ ...CHART_OPTS, indexAxis: 'y' }} />
            </div>
          </div>
        )}
      </div>

      {/* ROW 6 — Business intelligence */}
      {financial && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="metal-card px-4 py-3">
            <p className="text-[10px] text-ink-500 uppercase tracking-wide mb-1">Phase</p>
            <p className="text-sm font-bold text-ink-100">{financial.phase.replace('_', ' ')}</p>
            <p className="text-[10px] text-ink-500">Vehicle: {formatCurrency(financial.weekly_vehicle_cost)}/wk</p>
          </div>
          <div className="metal-card px-4 py-3">
            <p className="text-[10px] text-ink-500 uppercase tracking-wide mb-1">Monthly Nut</p>
            <p className="text-sm font-bold text-ink-100">{formatCurrency(financial.monthly_nut)}</p>
            <p className="text-[10px] text-ink-500">Need {formatCurrency(financial.monthly_nut / 30)}/day</p>
          </div>
          <div className="metal-card px-4 py-3">
            <p className="text-[10px] text-ink-500 uppercase tracking-wide mb-1">Breakeven Hours/Week</p>
            <p className="text-sm font-bold text-ink-100">
              {financial.breakeven_per_hour > 0 ? round1(financial.weekly_vehicle_cost / financial.breakeven_per_hour * 2) : '—'}h
            </p>
            <p className="text-[10px] text-ink-500">At ${financial.breakeven_per_hour}/hr to cover nut</p>
          </div>
        </div>
      )}

      {/* ROW 7 — Tax & mileage */}
      {taxSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="YTD Miles" value={round1(taxSummary.total_miles)} sub={`@ $${taxSummary.irs_mileage_rate}/mi`} />
          <Stat label="Mileage Deduction" value={formatCurrency(taxSummary.mileage_deduction)} color="text-success" />
          <Stat label="SE Tax Liability" value={formatCurrency(taxSummary.se_tax_liability)} color="text-ember" />
          <Stat label="Maint $/mile" value={`$${taxSummary.maintenance_cost_per_mile}`}
            sub={`Next due: ${format(new Date(taxSummary.next_quarterly_due + 'T00:00'), 'MMM d')}`} />
        </div>
      )}

      {/* ROW 8 — Job search pipeline */}
      {jobSearch && (
        <div className="metal-card px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase size={14} className="text-neural" />
            <span className="text-xs font-semibold text-ink-100">Job Search Pipeline</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <div><p className="text-[9px] text-ink-500">Apps (week)</p><p className="text-sm font-bold text-ink-100">{jobSearch.this_week_applications}</p></div>
            <div><p className="text-[9px] text-ink-500">Apps (total)</p><p className="text-sm font-bold text-ink-100">{jobSearch.total_applications}</p></div>
            <div><p className="text-[9px] text-ink-500">Recruiters (week)</p><p className="text-sm font-bold text-ink-100">{jobSearch.this_week_recruiter}</p></div>
            <div><p className="text-[9px] text-ink-500">Recruiters (total)</p><p className="text-sm font-bold text-ink-100">{jobSearch.total_recruiter_contacts}</p></div>
            <div><p className="text-[9px] text-ink-500">LinkedIn (week)</p><p className="text-sm font-bold text-ink-100">{jobSearch.this_week_linkedin}</p></div>
            <div><p className="text-[9px] text-ink-500">LinkedIn (total)</p><p className="text-sm font-bold text-ink-100">{jobSearch.total_linkedin}</p></div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {summary && summary.days_worked === 0 && (
        <div className="metal-card px-6 py-8 text-center">
          <p className="text-ink-400 text-sm">No shift data logged yet for this period.</p>
          <p className="text-ink-500 text-xs mt-1">Start logging on the Shift Log (home) page to see analytics here.</p>
        </div>
      )}
    </div>
  );
}
