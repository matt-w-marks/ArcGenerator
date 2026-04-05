import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import {
  MapPin, Zap, Briefcase, Coffee, StickyNote, ClipboardCheck,
  ChevronDown, ChevronUp, Check, AlertCircle,
  Play, Plus, Trash2, Car,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, round1 } from '../lib/utils';

// ── Constants ────────────────────────────────────────────────────────────────

const BLOCK_STYLES = {
  zone: 'border-arc/40 text-arc', event: 'border-ember/40 text-ember',
  job: 'border-neural/40 text-neural', rest: 'border-obsidian-500 text-ink-300',
  note: 'border-success/30 text-success', checklist: 'border-yellow-500/30 text-yellow-400',
};
const BLOCK_BG = {
  zone: 'bg-arc/8', event: 'bg-ember/8', job: 'bg-neural/8',
  rest: 'bg-obsidian-800/60', note: 'bg-success/5', checklist: 'bg-yellow-500/5',
};
const BLOCK_ICONS = {
  zone: MapPin, event: Zap, job: Briefcase, rest: Coffee,
  note: StickyNote, checklist: ClipboardCheck,
};
const EXPENSE_CATS = [
  { value: 'gas', label: 'Gas' }, { value: 'tolls', label: 'Tolls' },
  { value: 'parking', label: 'Parking' }, { value: 'car_wash', label: 'Car Wash' },
  { value: 'food', label: 'Food' }, { value: 'other', label: 'Other' },
];

function hexToRgba(hex, alpha) {
  if (!hex || hex.length < 7) return `rgba(107,114,128,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fmt12h(h) {
  const h24 = h % 24, hr = Math.floor(h24), half = h24 % 1 !== 0, m = half ? ':30' : '';
  if (hr === 0) return `12${m} AM`;
  if (hr === 12) return `12${m} PM`;
  return hr < 12 ? `${hr}${m} AM` : `${hr - 12}${m} PM`;
}

function currentHour() { const n = new Date(); return n.getHours() + n.getMinutes() / 60; }

function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }

// ── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ blocks, dayData }) {
  const dl = (b) => b.daily_log || {};
  const totalPlanned  = blocks.reduce((s, b) => s + (Number(b.gross_revenue) || 0), 0);
  const totalActual   = blocks.reduce((s, b) => s + (Number(dl(b).actual_gross) || 0), 0);
  const totalExpenses = blocks.reduce((s, b) => s + (dl(b).expenses || []).reduce((es, e) => es + Number(e.amount), 0), 0);
  const totalTrips    = blocks.reduce((s, b) => s + (dl(b).trip_count || 0), 0);
  const totalMiles    = blocks.reduce((s, b) => s + (Number(dl(b).miles_driven) || 0), 0);
  const totalHours    = blocks.reduce((s, b) => s + (b.hour_end - b.hour_start), 0);
  const net = totalActual - totalExpenses;

  return (
    <div className="metal-card px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: dayData?.schedule_color || '#6b7280' }} />
        <span className="text-sm font-semibold text-ink-100">{dayData?.schedule_name || 'Today'}</span>
        {dayData?.schedule_description && (
          <span className="text-[10px] text-ink-500 truncate">— {dayData.schedule_description}</span>
        )}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <div><p className="text-[10px] text-ink-50 uppercase tracking-wide font-bold">Planned</p><p className="text-base font-normal text-ink-300 font-mono">{formatCurrency(totalPlanned)}</p></div>
        <div><p className="text-[10px] text-ink-50 uppercase tracking-wide font-bold">Actual</p><p className="text-base font-normal text-ink-300 font-mono">{formatCurrency(totalActual)}</p></div>
        <div><p className="text-[10px] text-ink-50 uppercase tracking-wide font-bold">Expenses</p><p className="text-base font-normal text-error font-mono">{formatCurrency(totalExpenses)}</p></div>
        <div><p className="text-[10px] text-ink-50 uppercase tracking-wide font-bold">Net</p><p className={`text-base font-normal font-mono ${net >= 0 ? 'text-success' : 'text-error'}`}>{formatCurrency(net)}</p></div>
        <div><p className="text-[10px] text-ink-50 uppercase tracking-wide font-bold">Trips</p><p className="text-base font-normal text-ink-300">{totalTrips}</p></div>
        <div><p className="text-[10px] text-ink-50 uppercase tracking-wide font-bold">Miles</p><p className="text-base font-normal text-ink-300 font-mono">{round1(totalMiles)}</p></div>
      </div>
    </div>
  );
}

// ── Expense form ─────────────────────────────────────────────────────────────

function ExpenseForm({ blockId, entryDate, onAdd }) {
  const [cat, setCat] = useState('gas');
  const [amt, setAmt] = useState('');
  const [desc, setDesc] = useState('');
  const [open, setOpen] = useState(false);

  async function handleAdd() {
    if (!amt || Number(amt) <= 0) return;
    await onAdd(blockId, { entry_date: entryDate, category: cat, amount: Number(amt), description: desc || null });
    setAmt(''); setDesc(''); setOpen(false);
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-[10px] text-ink-400 hover:text-ink-50 flex items-center gap-1 transition-colors">
      <Plus size={10} /> Add expense
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <select className="arc-input text-xs py-1 font-light w-24" value={cat} onChange={(e) => setCat(e.target.value)}>
        {EXPENSE_CATS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <input type="number" step="0.01" min="0" placeholder="$0.00" className="arc-input text-xs py-1 font-light w-20 font-mono"
        value={amt} onChange={(e) => setAmt(e.target.value)} />
      <input type="text" placeholder="Description" className="arc-input text-xs py-1 font-light flex-1 min-w-24" maxLength={256}
        value={desc} onChange={(e) => setDesc(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }} />
      <button onClick={handleAdd} className="btn-primary text-[10px] py-1 px-2">Add</button>
      <button onClick={() => setOpen(false)} className="btn-ghost text-[10px] py-1">Cancel</button>
    </div>
  );
}

// ── Platform earning row + form ──────────────────────────────────────────────

function PlatformEarningRow({ pe, onDelete }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pe.platform_color || '#6b7280' }} />
      <span className="text-ink-200">{pe.platform_name}</span>
      <span className="font-mono text-ink-100">{formatCurrency(pe.earnings)}</span>
      {pe.trip_count != null && <span className="text-ink-500">{pe.trip_count} trips</span>}
      <button onClick={() => onDelete(pe.id)} className="text-ink-500 hover:text-error ml-auto p-0.5 transition-colors"><Trash2 size={10} /></button>
    </div>
  );
}

function PlatformEarningForm({ blockId, entryDate, platforms, onAdd }) {
  const [pid, setPid] = useState('');
  const [earn, setEarn] = useState('');
  const [trips, setTrips] = useState('');
  const [open, setOpen] = useState(false);

  async function handleAdd() {
    if (!pid || !earn) return;
    await onAdd(blockId, { entry_date: entryDate, platform_id: pid, earnings: Number(earn), trip_count: trips ? Number(trips) : null });
    setEarn(''); setTrips(''); setOpen(false);
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-[10px] text-ink-400 hover:text-ink-50 flex items-center gap-1 transition-colors">
      <Plus size={10} /> Log platform
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <select className="arc-input text-xs py-1 font-light w-28" value={pid} onChange={(e) => setPid(e.target.value)}>
        <option value="">Platform…</option>
        {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input type="number" step="0.01" min="0" placeholder="$0.00" className="arc-input text-xs py-1 font-light w-20 font-mono"
        value={earn} onChange={(e) => setEarn(e.target.value)} />
      <input type="number" min="0" placeholder="Trips" className="arc-input text-xs py-1 font-light w-16"
        value={trips} onChange={(e) => setTrips(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }} />
      <button onClick={handleAdd} className="btn-primary text-[10px] py-1 px-2">Add</button>
      <button onClick={() => setOpen(false)} className="btn-ghost text-[10px] py-1">Cancel</button>
    </div>
  );
}

// ── Block card ───────────────────────────────────────────────────────────────

function BlockCard({ block, entryDate, isCurrent, expanded, onToggle, onSave, onAddExpense, onDeleteExpense, onAddPlatformEarning, onDeletePlatformEarning, platforms }) {
  const log = block.daily_log || {};
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm({
      actual_gross: log.actual_gross ?? '',
      trip_count: log.trip_count ?? '',
      actual_start: log.actual_start ?? '',
      actual_end: log.actual_end ?? '',
      odometer_start: log.odometer_start ?? '',
      odometer_end: log.odometer_end ?? '',
      surge_active: log.surge_active ?? false,
      log_notes: log.log_notes ?? '',
    });
    setDirty(false);
  }, [block]);

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); setDirty(true); }

  async function handleSave() {
    const data = { entry_date: entryDate };
    if (form.actual_gross !== '') data.actual_gross = Number(form.actual_gross);
    if (form.trip_count !== '') data.trip_count = Number(form.trip_count);
    if (form.actual_start) data.actual_start = form.actual_start;
    if (form.actual_end) data.actual_end = form.actual_end;
    if (form.odometer_start !== '') data.odometer_start = Number(form.odometer_start);
    if (form.odometer_end !== '') data.odometer_end = Number(form.odometer_end);
    data.surge_active = form.surge_active;
    if (form.log_notes) data.log_notes = form.log_notes;
    await onSave(block.id, data);
    setDirty(false);
  }

  const Icon = BLOCK_ICONS[block.block_type] || StickyNote;
  const typeStyle = BLOCK_STYLES[block.block_type] || BLOCK_STYLES.note;
  const bgStyle = BLOCK_BG[block.block_type] || BLOCK_BG.note;
  const duration = block.hour_end - block.hour_start;
  const planned = Number(block.gross_revenue) || 0;
  const expenses = log.expenses || [];
  const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const miles = (form.odometer_start !== '' && form.odometer_end !== '')
    ? round1(Number(form.odometer_end) - Number(form.odometer_start))
    : log.miles_driven != null ? round1(log.miles_driven) : null;

  return (
    <div
      className={`rounded-xl border transition-all ${typeStyle} ${bgStyle} ${isCurrent ? 'ring-2 ring-arc/50 shadow-lg shadow-arc/10' : ''}`}
      style={block.platform_colors?.length > 0 ? { borderLeftWidth: 4, borderLeftColor: block.platform_colors[0] } : undefined}
    >
      {/* Collapsed header */}
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <Icon size={14} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{block.label}</span>
            {isCurrent && (
              <span className="flex items-center gap-1 text-[9px] font-bold text-arc bg-arc/15 px-1.5 py-0.5 rounded-full animate-pulse">
                <Play size={7} fill="currentColor" /> NOW
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-ink-500 mt-0.5">
            <span className="font-mono">{fmt12h(block.hour_start)}–{fmt12h(block.hour_end)}</span>
            <span>{round1(duration)}h</span>
            {block.zone_name && <span>· {block.zone_name}</span>}
            {planned > 0 && <span>· Plan {formatCurrency(planned)}</span>}
            {log.actual_gross != null && <span className="text-success">· Actual {formatCurrency(log.actual_gross)}</span>}
            {log.trip_count != null && <span>· {log.trip_count} trips</span>}
            {totalExp > 0 && <span className="text-error">· -{formatCurrency(totalExp)}</span>}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-ink-400 shrink-0" /> : <ChevronDown size={14} className="text-ink-400 shrink-0" />}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-current/10">
          {/* Platform placards */}
          {block.platform_names?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-3">
              {block.platform_colors.map((color, i) => (
                <span key={i} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: hexToRgba(color, 0.18), color, border: `1px solid ${hexToRgba(color, 0.5)}` }}>
                  {block.platform_names[i]}
                </span>
              ))}
            </div>
          )}

          {/* Core metrics form */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-0.5">Gross Earnings</label>
              <input type="number" step="0.01" min="0" className="arc-input text-xs py-1 font-light font-mono w-full"
                placeholder="$0.00" value={form.actual_gross} onChange={(e) => update('actual_gross', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-0.5">Trip Count</label>
              <input type="number" min="0" className="arc-input text-xs py-1 font-light w-full"
                placeholder="0" value={form.trip_count} onChange={(e) => update('trip_count', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-0.5">Actual Start</label>
              <input type="time" className="arc-input text-xs py-1 font-light w-full font-mono"
                value={form.actual_start} onChange={(e) => update('actual_start', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-0.5">Actual End</label>
              <input type="time" className="arc-input text-xs py-1 font-light w-full font-mono"
                value={form.actual_end} onChange={(e) => update('actual_end', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-0.5">Odo Start</label>
              <input type="number" step="0.1" min="0" className="arc-input text-xs py-1 font-light font-mono w-full"
                placeholder="0.0" value={form.odometer_start} onChange={(e) => update('odometer_start', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-0.5">Odo End</label>
              <input type="number" step="0.1" min="0" className="arc-input text-xs py-1 font-light font-mono w-full"
                placeholder="0.0" value={form.odometer_end} onChange={(e) => update('odometer_end', e.target.value)} />
            </div>
          </div>

          {miles != null && <p className="text-[10px] text-ink-500 flex items-center gap-1"><Car size={10} /> {miles} miles</p>}

          {/* Surge toggle */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => update('surge_active', !form.surge_active)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${form.surge_active ? 'bg-ember/15 text-ember' : 'bg-obsidian-700 text-ink-400'}`}>
              {form.surge_active ? 'Surge Active' : 'No Surge'}
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-0.5">Shift Notes</label>
            <textarea className="arc-input text-xs font-light resize-none w-full" rows={2} placeholder="Traffic, incidents, observations…"
              value={form.log_notes} onChange={(e) => update('log_notes', e.target.value)} />
          </div>

          {/* Save button */}
          {dirty && (
            <button onClick={handleSave} className="btn-primary text-xs gap-1.5 w-full">
              <Check size={12} /> Save Block Log
            </button>
          )}

          {/* Platform earnings */}
          <div>
            <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide mb-1.5">Platform Breakdown</p>
            <div className="space-y-1.5">
              {(log.platform_earnings || []).map((pe) => (
                <PlatformEarningRow key={pe.id} pe={pe} onDelete={onDeletePlatformEarning} />
              ))}
              <PlatformEarningForm blockId={block.id} entryDate={entryDate} platforms={platforms} onAdd={onAddPlatformEarning} />
            </div>
          </div>

          {/* Expenses */}
          <div>
            <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide mb-1.5">Expenses</p>
            <div className="space-y-1">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  <span className="text-ink-400 capitalize w-14">{e.category.replace('_', ' ')}</span>
                  <span className="font-mono text-error">{formatCurrency(e.amount)}</span>
                  {e.description && <span className="text-ink-500 truncate flex-1">{e.description}</span>}
                  <button onClick={() => onDeleteExpense(e.id)} className="text-ink-500 hover:text-error p-0.5 transition-colors"><Trash2 size={10} /></button>
                </div>
              ))}
              <ExpenseForm blockId={block.id} entryDate={entryDate} onAdd={onAddExpense} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [dayData, setDayData] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [noSchedule, setNoSchedule] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(currentHour());

  const entryDate = todayStr();

  useEffect(() => {
    const id = setInterval(() => setNow(currentHour()), 60000);
    return () => clearInterval(id);
  }, []);

  const loadDay = useCallback(async () => {
    const [dayRes, platRes] = await Promise.all([
      api.get('/metrics/shift-log/today'),
      api.get('/metrics/platforms?include_inactive=false'),
    ]);
    if (!dayRes.ok) { setNoSchedule(true); return; }
    const data = await dayRes.json();
    setDayData(data);
    setBlocks(data.blocks || []);
    setNoSchedule(false);
    if (platRes.ok) setPlatforms(await platRes.json());
  }, []);

  useEffect(() => { loadDay(); }, [loadDay]);

  // Auto-expand current block on first load
  useEffect(() => {
    if (expanded === null && blocks.length > 0) {
      const cur = blocks.find((b) => b.hour_start <= now && b.hour_end > now);
      if (cur) setExpanded(cur.id);
    }
  }, [blocks, now, expanded]);

  async function handleSaveBlock(blockId, data) {
    await api.put(`/metrics/shift-log/blocks/${blockId}`, data);
    await loadDay();
  }
  async function handleAddExpense(blockId, data) {
    await api.post(`/metrics/shift-log/blocks/${blockId}/expenses`, data);
    await loadDay();
  }
  async function handleDeleteExpense(expenseId) {
    await api.delete(`/metrics/shift-log/expenses/${expenseId}`);
    await loadDay();
  }
  async function handleAddPlatformEarning(blockId, data) {
    await api.post(`/metrics/shift-log/blocks/${blockId}/platform-earnings`, data);
    await loadDay();
  }
  async function handleDeletePlatformEarning(earningId) {
    await api.delete(`/metrics/shift-log/platform-earnings/${earningId}`);
    await loadDay();
  }

  if (error) return <div className="flex items-center gap-2 text-error text-sm p-8"><AlertCircle size={16} /> {error}</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="page-title">Shift Log</h1>
        <p className="text-xs text-ink-400 mt-0.5">
          {format(new Date(), 'EEEE, MMMM d')} · {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
        </p>
      </div>

      {noSchedule && (
        <div className="metal-card px-6 py-10 text-center space-y-2">
          <p className="text-ink-300 text-sm">No schedule assigned to today.</p>
          <p className="text-ink-500 text-xs">Go to <span className="text-arc">Schedule</span> → Calendar to assign one.</p>
        </div>
      )}

      {dayData && (
        <>
          <SummaryBar blocks={blocks} dayData={dayData} />
          <div className="space-y-2">
            {blocks.map((b) => (
              <BlockCard
                key={b.id}
                block={b}
                entryDate={entryDate}
                isCurrent={b.hour_start <= now && b.hour_end > now}
                expanded={expanded === b.id}
                onToggle={() => setExpanded(expanded === b.id ? null : b.id)}
                onSave={handleSaveBlock}
                onAddExpense={handleAddExpense}
                onDeleteExpense={handleDeleteExpense}
                onAddPlatformEarning={handleAddPlatformEarning}
                onDeletePlatformEarning={handleDeletePlatformEarning}
                platforms={platforms}
              />
            ))}
          </div>
          {blocks.length === 0 && (
            <div className="metal-card px-6 py-8 text-center">
              <p className="text-ink-400 text-sm">Schedule has no blocks. Add some in the Schedule page.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
