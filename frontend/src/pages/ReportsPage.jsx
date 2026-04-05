import { useEffect, useState, useCallback } from 'react';
import { format, subDays, startOfMonth, startOfWeek, differenceInCalendarDays } from 'date-fns';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import {
  AlertCircle, TrendingUp, TrendingDown, Minus, Info,
  DollarSign, Car, Briefcase, Target, Gauge, Eye, BookOpen,
  ChevronRight, Fuel, Shield, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, round1 } from '../lib/utils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

function ds(d) { return format(d, 'yyyy-MM-dd'); }

// ── Chart defaults ───────────────────────────────────────────────────────────

const CHART_FONT = { family: 'ui-monospace, monospace', size: 10 };
const GRID_COLOR = 'rgba(100,116,139,0.08)';
const lineOpts = (label) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { titleFont: CHART_FONT, bodyFont: CHART_FONT } },
  scales: {
    x: { ticks: { color: '#64748b', font: CHART_FONT }, grid: { display: false } },
    y: { ticks: { color: '#64748b', font: CHART_FONT, callback: (v) => '$' + v }, grid: { color: GRID_COLOR } },
  },
});
const barOpts = { ...lineOpts(), indexAxis: 'y' };
const donutOpts = {
  responsive: true, maintainAspectRatio: false, cutout: '65%',
  plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { ...CHART_FONT, size: 9 }, padding: 6, boxWidth: 10 } } },
};

// ── Insight helpers ──────────────────────────────────────────────────────────

function pctChange(current, previous) {
  if (!previous || previous === 0) return null;
  return Math.round((current - previous) / previous * 100);
}

function TrendBadge({ value, unit = '%', inverse = false }) {
  if (value == null) return null;
  const good = inverse ? value < 0 : value > 0;
  const color = value === 0 ? 'text-ink-400' : good ? 'text-success' : 'text-error';
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono ${color}`}>
      <Icon size={10} />{Math.abs(value)}{unit}
    </span>
  );
}

function HealthDot({ status }) {
  const colors = { good: 'bg-success', warning: 'bg-ember', bad: 'bg-error', neutral: 'bg-ink-500' };
  return <span className={`w-2.5 h-2.5 rounded-full ${colors[status] || colors.neutral}`} />;
}

function InfoTip({ formula, description }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="text-ink-600 hover:text-ink-300 transition-colors p-0.5"
      >
        <Info size={11} />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-obsidian-800 border border-obsidian-600 rounded-lg shadow-xl px-3 py-2.5 text-left pointer-events-none">
          {description && <p className="text-[10px] text-ink-300 leading-relaxed mb-1">{description}</p>}
          {formula && (
            <p className="text-[9px] text-ink-500 font-mono bg-obsidian-900/60 rounded px-1.5 py-1 leading-relaxed">{formula}</p>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-obsidian-800 border-r border-b border-obsidian-600 rotate-45 -mt-1" />
        </div>
      )}
    </span>
  );
}

function ProgressRing({ pct, size = 48, stroke = 4, color = '#38bdf8' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(100,116,139,0.15)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={pct >= 100 ? '#22c55e' : color}
        strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} className="transition-all duration-500" />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        className="text-[10px] font-bold fill-ink-100 font-mono">{Math.min(pct, 100)}%</text>
    </svg>
  );
}

// ── Scorecard View ───────────────────────────────────────────────────────────

function ScorecardView({ summary, weekly, financial, expenses, byDay, byPlatform, byZone, taxSummary, jobSearch }) {
  const dailyTarget = financial ? financial.monthly_nut / 30 : 116.67;
  const netPct = summary ? Math.round(summary.total_net / dailyTarget * 100) : 0;
  const tripPct = weekly ? Math.round(weekly.trips_this_week / weekly.trips_target * 100) : 0;
  const perHourStatus = summary && financial
    ? summary.avg_per_hour >= financial.breakeven_per_hour * 1.5 ? 'good' : summary.avg_per_hour >= financial.breakeven_per_hour ? 'warning' : 'bad'
    : 'neutral';
  const gasPctStatus = expenses ? (expenses.gas_pct_of_gross > 12 ? 'bad' : expenses.gas_pct_of_gross > 8 ? 'warning' : 'good') : 'neutral';
  const runwayStatus = financial ? (financial.runway_days >= 60 ? 'good' : financial.runway_days >= 30 ? 'warning' : 'bad') : 'neutral';

  // Yesterday comparison
  const yesterday = byDay.length >= 2 ? byDay[byDay.length - 2] : null;
  const today = byDay.length >= 1 ? byDay[byDay.length - 1] : null;
  const netChange = today && yesterday ? pctChange(today.net, yesterday.net) : null;

  return (
    <div className="space-y-4">
      {/* Hero scorecard */}
      <div className="metal-card px-5 py-5">
        <div className="flex items-center gap-4 mb-4">
          <ProgressRing pct={netPct} size={56} stroke={5} />
          <div>
            <p className="text-2xl font-bold font-mono text-ink-50">
              {summary ? formatCurrency(summary.total_net) : '$—'} <span className="text-sm text-ink-400 font-normal">net</span>
            </p>
            <p className="text-xs text-ink-400 flex items-center gap-2">
              {netPct}% of {formatCurrency(dailyTarget)} daily target
              {netChange != null && <TrendBadge value={netChange} />}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm font-mono text-ink-200 flex items-center gap-1 justify-end">
              {summary ? `$${summary.avg_per_hour}/hr` : '—'}
              <InfoTip description="Your actual average earnings per active hour on the road." formula="total_gross / active_hours" />
            </p>
            <p className="text-[10px] text-ink-500 flex items-center gap-1 justify-end">
              breakeven: ${financial?.breakeven_per_hour || '—'}/hr
              <InfoTip description="The minimum $/hr you need to cover vehicle costs + gas. Below this you're losing money." formula="(weekly_vehicle_cost + weekly_gas) / active_hours" />
            </p>
          </div>
        </div>

        {/* Health indicators row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex items-center gap-2">
            <HealthDot status={perHourStatus} />
            <div>
              <p className="text-[10px] text-ink-500 flex items-center gap-1">
                $/hr
                <InfoTip
                  description="Your average earnings per active hour driven. Green if 1.5x+ breakeven, yellow if above breakeven, red if below."
                  formula="actual_gross / active_hours"
                />
              </p>
              <p className="text-sm font-mono text-ink-100">${summary?.avg_per_hour || 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HealthDot status={gasPctStatus} />
            <div>
              <p className="text-[10px] text-ink-500 flex items-center gap-1">
                Gas %
                <InfoTip
                  description="What percentage of your gross earnings goes to fuel. Above 12% is a red flag — consider cheaper stations or more efficient routing."
                  formula="gas_expenses / gross_earnings × 100"
                />
              </p>
              <p className="text-sm font-mono text-ink-100">{expenses?.gas_pct_of_gross || 0}%</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HealthDot status={runwayStatus} />
            <div>
              <p className="text-[10px] text-ink-500 flex items-center gap-1">
                Runway
                <InfoTip
                  description="How many days your bankroll covers at current monthly burn rate. Green 60+, yellow 30-60, red under 30."
                  formula="bankroll / (monthly_nut / 30)"
                />
              </p>
              <p className="text-sm font-mono text-ink-100">{round1(financial?.runway_days || 0)}d</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ProgressRing pct={tripPct} size={32} stroke={3} />
            <div>
              <p className="text-[10px] text-ink-500 flex items-center gap-1">
                Hertz Trips
                <InfoTip
                  description="Weekly trip minimum for your Hertz rental agreement. Must hit 30 trips per Mon-Sun week to avoid penalties. Resets every Monday."
                  formula="trips_this_week / 30"
                />
              </p>
              <p className="text-sm font-mono text-ink-100">{weekly?.trips_this_week || 0}/{weekly?.trips_target || 30}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { l: 'Gross', v: formatCurrency(summary?.total_gross || 0), d: 'Total earnings before expenses.', f: 'SUM(actual_gross)' },
          { l: 'Expenses', v: formatCurrency(summary?.total_expenses || 0), c: 'text-error', d: 'All logged expenses: gas, tolls, parking, food, etc.', f: 'SUM(expenses.amount)' },
          { l: 'Trips', v: summary?.total_trips || 0, d: 'Total completed rides/deliveries across all platforms.', f: 'SUM(trip_count)' },
          { l: 'Miles', v: round1(summary?.total_miles || 0), d: 'Total miles driven. Used for IRS mileage deduction.', f: 'SUM(odometer_end - odometer_start)' },
          { l: 'Hours', v: `${summary?.total_active_hours || 0}h`, d: 'Active driving hours (actual start to actual end per block).', f: 'SUM(actual_end - actual_start)' },
          { l: '$/mile', v: `$${summary?.avg_per_mile || 0}`, d: 'Earnings efficiency per mile driven. Higher = less dead miles.', f: 'gross / miles_driven' },
        ].map((s, i) => (
          <div key={i} className="metal-card px-2.5 py-2">
            <p className="text-[8px] text-ink-600 uppercase tracking-wide flex items-center gap-1">
              {s.l}
              <InfoTip description={s.d} formula={s.f} />
            </p>
            <p className={`text-sm font-bold font-mono ${s.c || 'text-ink-100'}`}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {byDay.length > 0 && (
          <div className="metal-card p-4">
            <p className="text-[10px] text-ink-500 uppercase tracking-wide mb-2">Net Trend</p>
            <div style={{ height: 160 }}>
              <Line data={{
                labels: byDay.map((d) => format(new Date(d.date + 'T00:00'), 'EEE')),
                datasets: [{
                  data: byDay.map((d) => d.net),
                  borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.08)',
                  fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: byDay.map((d) => d.net >= 0 ? '#22c55e' : '#ef4444'),
                }],
              }} options={lineOpts()} />
            </div>
          </div>
        )}
        {byPlatform.length > 0 && (
          <div className="metal-card p-4">
            <p className="text-[10px] text-ink-500 uppercase tracking-wide mb-2">Platform Split</p>
            <div style={{ height: 160 }}>
              <Doughnut data={{
                labels: byPlatform.map((p) => p.platform_name),
                datasets: [{ data: byPlatform.map((p) => p.total_earnings), backgroundColor: byPlatform.map((p) => p.platform_color || '#6b7280') }],
              }} options={donutOpts} />
            </div>
          </div>
        )}
      </div>

      {/* Financial health bar */}
      {financial && (
        <div className="metal-card px-4 py-3 flex items-center gap-4">
          <Shield size={16} className="text-ember shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-ink-200 flex items-center gap-1">
                Bankroll
                <InfoTip
                  description="Your remaining cash reserve. This is your safety net — covers monthly obligations when driving income is short. Updated manually."
                  formula="bankroll / (monthly_nut / 30) = runway_days"
                />
              </span>
              <span className="text-xs font-mono text-ink-100">{formatCurrency(financial.bankroll_remaining)}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-obsidian-700 overflow-hidden">
              <div className={`h-full rounded-full ${runwayStatus === 'good' ? 'bg-success' : runwayStatus === 'warning' ? 'bg-ember' : 'bg-error'}`}
                style={{ width: `${Math.min(100, financial.runway_days / 90 * 100)}%` }} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-mono text-ink-100">{round1(financial.runway_days)}d</p>
            <p className="text-[9px] text-ink-500">runway</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Story View ───────────────────────────────────────────────────────────────

function StoryView({ summary, weekly, financial, expenses, byDay, byPlatform, byZone, taxSummary, jobSearch, rangeName }) {
  const dailyTarget = financial ? financial.monthly_nut / 30 : 116.67;

  function Section({ title, insight, children }) {
    return (
      <div className="metal-card px-5 py-4 space-y-3">
        <p className="text-sm font-semibold text-ink-100">{title}</p>
        {insight && <p className="text-xs text-ink-400 leading-relaxed">{insight}</p>}
        {children}
      </div>
    );
  }

  // Build narrative strings
  const grossStr = summary ? formatCurrency(summary.total_gross) : '$0';
  const netStr = summary ? formatCurrency(summary.total_net) : '$0';
  const hoursStr = summary ? `${summary.total_active_hours}` : '0';
  const perHrStr = summary ? `$${summary.avg_per_hour}` : '$0';
  const daysStr = summary ? `${summary.days_worked}` : '0';

  const yesterdayNet = byDay.length >= 2 ? byDay[byDay.length - 2]?.net : null;
  const todayNet = byDay.length >= 1 ? byDay[byDay.length - 1]?.net : null;
  const trendWord = todayNet != null && yesterdayNet != null
    ? todayNet > yesterdayNet ? 'up' : todayNet < yesterdayNet ? 'down' : 'flat'
    : null;

  const bestDay = byDay.length > 0 ? byDay.reduce((best, d) => d.net > best.net ? d : best, byDay[0]) : null;
  const bestZone = byZone.length > 0 ? byZone[0] : null;
  const topPlatform = byPlatform.length > 0 ? byPlatform[0] : null;

  const weeklyPace = weekly && weekly.gross > 0
    ? Math.round(weekly.gross / Math.max(1, differenceInCalendarDays(new Date(), new Date(weekly.week_start + 'T00:00')) + 1) * 7)
    : null;
  const weeklyTarget = financial ? Math.round(financial.monthly_nut / 4.3) : 814;

  return (
    <div className="space-y-3">
      {/* Chapter 1: Your earnings */}
      <Section
        title="Your Earnings"
        insight={summary && summary.days_worked > 0
          ? `You made ${netStr} net across ${daysStr} day${summary.days_worked > 1 ? 's' : ''}, averaging ${perHrStr}/hr over ${hoursStr} active hours.${
            trendWord ? ` Trending ${trendWord} from ${yesterdayNet != null ? formatCurrency(yesterdayNet) : 'yesterday'}.` : ''
          }${summary.variance >= 0 ? ` You're ${formatCurrency(summary.variance)} ahead of plan.` : ` You're ${formatCurrency(Math.abs(summary.variance))} behind plan.`}`
          : 'No shift data logged yet for this period. Start logging on the Shift Log page.'
        }
      >
        {byDay.length > 0 && (
          <div style={{ height: 140 }}>
            <Bar data={{
              labels: byDay.map((d) => format(new Date(d.date + 'T00:00'), 'EEE M/d')),
              datasets: [
                { label: 'Net', data: byDay.map((d) => d.net), backgroundColor: byDay.map((d) => d.net >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)') },
              ],
            }} options={lineOpts()} />
          </div>
        )}
      </Section>

      {/* Chapter 2: Your week */}
      {weekly && (
        <Section
          title="Your Week"
          insight={`${weekly.trips_this_week} of ${weekly.trips_target} Hertz trips completed.${
            weeklyPace ? ` At current pace you'll hit ${weeklyPace >= weeklyTarget ? formatCurrency(weeklyPace) + ' — above' : formatCurrency(weeklyPace) + ' — below'} the ${formatCurrency(weeklyTarget)}/week target.` : ''
          }${weekly.trips_this_week >= weekly.trips_target ? ' Trip minimum met.' : ` Need ${weekly.trips_target - weekly.trips_this_week} more trips.`}`}
        >
          <div className="flex items-center gap-3">
            <ProgressRing pct={Math.round(weekly.trips_this_week / weekly.trips_target * 100)} size={48} stroke={4} />
            <div className="flex-1">
              <div className="w-full h-2 rounded-full bg-obsidian-700 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${weekly.trips_this_week >= weekly.trips_target ? 'bg-success' : 'bg-arc'}`}
                  style={{ width: `${Math.min(100, weekly.trips_this_week / weekly.trips_target * 100)}%` }} />
              </div>
              <div className="flex justify-between mt-1 text-[9px] text-ink-500 font-mono">
                <span>0</span><span>{weekly.trips_target}</span>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Chapter 3: What's working */}
      {(bestZone || topPlatform) && (
        <Section
          title="What's Working"
          insight={[
            bestZone ? `Best zone: ${bestZone.zone_name?.split('—')[0]?.trim()} at $${bestZone.per_hour}/hr.` : '',
            topPlatform ? `Top platform: ${topPlatform.platform_name} with ${formatCurrency(topPlatform.total_earnings)} (${topPlatform.total_trips} trips, $${topPlatform.avg_per_trip}/trip avg).` : '',
            bestDay ? `Best day: ${format(new Date(bestDay.date + 'T00:00'), 'EEEE')} at ${formatCurrency(bestDay.net)} net.` : '',
          ].filter(Boolean).join(' ')}
        >
          <div className="grid grid-cols-2 gap-3">
            {byZone.length > 0 && (
              <div style={{ height: 130 }}>
                <Bar data={{
                  labels: byZone.slice(0, 5).map((z) => z.zone_name?.split('—')[0]?.trim()?.slice(0, 14) || '?'),
                  datasets: [{ data: byZone.slice(0, 5).map((z) => z.per_hour), backgroundColor: 'rgba(56,189,248,0.4)' }],
                }} options={{ ...lineOpts(), indexAxis: 'y', scales: { ...lineOpts().scales, x: { ...lineOpts().scales.x, ticks: { ...lineOpts().scales.x.ticks, callback: (v) => '$' + v + '/hr' } } } }} />
              </div>
            )}
            {byPlatform.length > 0 && (
              <div style={{ height: 130 }}>
                <Doughnut data={{
                  labels: byPlatform.map((p) => p.platform_name),
                  datasets: [{ data: byPlatform.map((p) => p.total_earnings), backgroundColor: byPlatform.map((p) => p.platform_color || '#6b7280') }],
                }} options={donutOpts} />
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Chapter 4: Watch this */}
      {(expenses || financial) && (
        <Section
          title="Watch This"
          insight={[
            expenses && expenses.gas_pct_of_gross > 12 ? `Gas is ${expenses.gas_pct_of_gross}% of gross — above the 12% threshold. Consider cheaper fill-up options.` : '',
            expenses && expenses.gas_pct_of_gross <= 12 && expenses.gas_pct_of_gross > 0 ? `Gas at ${expenses.gas_pct_of_gross}% of gross — within target.` : '',
            financial && financial.breakeven_per_hour > 0 && summary && summary.avg_per_hour > 0 && summary.avg_per_hour < financial.breakeven_per_hour
              ? `Your $/hr ($${summary.avg_per_hour}) is below breakeven ($${financial.breakeven_per_hour}). You're losing money per hour driven.`
              : '',
            financial && summary && summary.avg_per_hour >= financial.breakeven_per_hour
              ? `Earning $${(summary.avg_per_hour - financial.breakeven_per_hour).toFixed(2)}/hr above breakeven.`
              : '',
          ].filter(Boolean).join(' ') || 'No warnings right now.'}
        >
          {expenses && expenses.by_category.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {expenses.by_category.map((c, i) => (
                <div key={i} className="px-2.5 py-1.5 rounded-lg bg-obsidian-800/60 border border-obsidian-700/50">
                  <p className="text-[9px] text-ink-500 capitalize">{c.category.replace('_', ' ')}</p>
                  <p className="text-xs font-mono text-ink-200">{formatCurrency(c.total)}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Chapter 5: Financial health */}
      {financial && (
        <Section
          title="Financial Health"
          insight={`Bankroll: ${formatCurrency(financial.bankroll_remaining)} with ${round1(financial.runway_days)} days of runway at current burn. ${
            financial.phase === 'PHASE_1' ? `Rental vehicle at ${formatCurrency(financial.weekly_vehicle_cost)}/week.` : ''
          } SE tax accrued: ${formatCurrency(financial.se_tax_accrued)} (${(financial.se_tax_rate * 100).toFixed(1)}% of gross).`}
        >
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <ProgressRing pct={Math.min(100, Math.round(financial.runway_days / 90 * 100))} size={44} stroke={4}
                color={financial.runway_days >= 60 ? '#22c55e' : financial.runway_days >= 30 ? '#f97316' : '#ef4444'} />
              <p className="text-[9px] text-ink-500 mt-1">Runway</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-ember">{formatCurrency(financial.se_tax_accrued)}</p>
              <p className="text-[9px] text-ink-500">SE Tax Set-Aside</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-ink-100">{formatCurrency(financial.mileage_deduction_ytd)}</p>
              <p className="text-[9px] text-ink-500">IRS Mileage Deduction</p>
            </div>
          </div>
        </Section>
      )}

      {/* Chapter 6: Job search */}
      {jobSearch && (jobSearch.total_applications > 0 || jobSearch.this_week_applications > 0) && (
        <Section
          title="Career Pipeline"
          insight={`${jobSearch.this_week_applications} applications this week, ${jobSearch.total_applications} total. ${jobSearch.this_week_recruiter} recruiter contacts this week.`}
        >
          <div className="flex gap-4 text-xs">
            <div><span className="text-ink-500">Apps:</span> <span className="font-mono text-ink-100">{jobSearch.total_applications}</span></div>
            <div><span className="text-ink-500">Recruiters:</span> <span className="font-mono text-ink-100">{jobSearch.total_recruiter_contacts}</span></div>
            <div><span className="text-ink-500">LinkedIn:</span> <span className="font-mono text-ink-100">{jobSearch.total_linkedin}</span></div>
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [view, setView] = useState('scorecard');
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
    const [sR, dR, zR, pR, eR, wR, fR, jR, tR] = await Promise.all([
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
    if (sR.ok) setSummary(await sR.json());
    if (dR.ok) setByDay(await dR.json());
    if (zR.ok) setByZone(await zR.json());
    if (pR.ok) setByPlatform(await pR.json());
    if (eR.ok) setExpenses(await eR.json());
    if (wR.ok) setWeekly(await wR.json());
    if (fR.ok) setFinancial(await fR.json());
    if (jR.ok) setJobSearch(await jR.json());
    if (tR.ok) setTaxSummary(await tR.json());
  }, [getRange]);

  useEffect(() => { load(); }, [load]);

  const data = { summary, weekly, financial, expenses, byDay, byPlatform, byZone, taxSummary, jobSearch };

  return (
    <div className="max-w-3xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">Reports</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-obsidian-600 overflow-hidden">
            <button onClick={() => setView('scorecard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${view === 'scorecard' ? 'bg-arc/10 text-arc' : 'text-ink-400 hover:text-ink-50'}`}>
              <Gauge size={12} /> Scorecard
            </button>
            <button onClick={() => setView('story')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${view === 'story' ? 'bg-arc/10 text-arc' : 'text-ink-400 hover:text-ink-50'}`}>
              <BookOpen size={12} /> Story
            </button>
          </div>
          {/* Range picker */}
          <div className="flex gap-1">
            {[['today', 'Today'], ['week', '7D'], ['month', 'MTD']].map(([k, label]) => (
              <button key={k} onClick={() => setRange(k)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${range === k ? 'border-arc/40 bg-arc/10 text-arc' : 'border-obsidian-600 text-ink-400 hover:text-ink-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* View */}
      {view === 'scorecard'
        ? <ScorecardView {...data} />
        : <StoryView {...data} rangeName={range} />
      }

      {/* Empty state */}
      {summary && summary.days_worked === 0 && (
        <div className="metal-card px-6 py-8 text-center">
          <p className="text-ink-400 text-sm">No shift data logged yet for this period.</p>
          <p className="text-ink-500 text-xs mt-1">Log your first shift on the home page to see your story here.</p>
        </div>
      )}
    </div>
  );
}
