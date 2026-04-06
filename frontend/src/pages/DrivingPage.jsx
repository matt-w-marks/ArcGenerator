import { useEffect, useRef, useState, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Plus, Trash2, AlertCircle, ChevronDown, ChevronUp, MapPin, Calendar, Wrench, ClipboardList, Check, Square, CheckSquare, ClipboardCheck } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDate, round1 } from '../lib/utils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const ZONE_TYPE_DESCRIPTIONS = {
  Anchor: 'Fixed staging — queue-based, position-dependent. PHX terminals, arena lots.',
  Core:   'High-density residential & commercial. Consistent demand all day. Biltmore, Downtown, Midtown, ASU.',
  Steady: 'Moderate consistent demand. Venue corridors & hotel rows. Convention Center, Scottsdale Fashion Square.',
  Events: 'Scheduled event-driven demand. Activate on event calendar. Footprint, Chase Field.',
  Surge:  'Time-gated burst demand. Position before the window opens. Old Town, Salt River, State Farm.',
};

const ZONE_TYPES    = ['Anchor', 'Core', 'Steady', 'Events', 'Surge'];
const SERVICE_TYPES = ['Rides', 'Food', 'Rest'];
const IMPACT_TYPES  = ['High Surge', 'Steady Boost'];

function emptyZoneForm() {
  return { name: '', zone_type: '', address: '', geo_lat: '', geo_lng: '', service_types: [] };
}

function emptyEventForm() {
  return { zone_id: '', event_name: '', activation_window: '', impact: '', week_of: '' };
}

function getDefaultForm() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return { date, gross_earnings: '', trip_count: '', zone_id: '', start_time: time, end_time: '', odometer_start: '', odometer_end: '' };
}

function fmt12(t) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ATM-style currency input: digits fill right-to-left in cents column.
function CurrencyInput({ value, onChange, required }) {
  const [digits, setDigits] = useState('');
  const inputRef  = useRef(null);
  const timerRef  = useRef(null);

  useEffect(() => {
    if (!value) setDigits('');
  }, [value]);

  function resetTimer() {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => inputRef.current?.blur(), 5000);
  }

  function handleFocusIn(e) {
    e.target.select();
    resetTimer();
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function handleKeyDown(e) {
    const allSelected =
      e.target.selectionStart === 0 &&
      e.target.selectionEnd === e.target.value.length &&
      e.target.value.length > 0;

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      const base = allSelected ? '' : digits;
      const next = base + e.key;
      if (next.length > 10) return;
      setDigits(next);
      onChange((parseInt(next, 10) / 100).toFixed(2));
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      const base = allSelected ? '' : digits;
      const next = base.slice(0, -1);
      setDigits(next);
      onChange(next ? (parseInt(next, 10) / 100).toFixed(2) : '');
    }
  }

  function fmtDisplay(d) {
    if (!d) return '';
    const padded = d.padStart(3, '0');
    const dollars = parseInt(padded.slice(0, -2), 10).toLocaleString();
    const cents   = padded.slice(-2);
    return `${dollars}.${cents}`;
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-300 pointer-events-none">$</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className="arc-input pl-6"
        value={fmtDisplay(digits)}
        onKeyDown={(e) => { handleKeyDown(e); resetTimer(); }}
        onChange={() => {}}
        onFocus={handleFocusIn}
        onClick={(e) => e.target.select()}
        onBlur={() => clearTimeout(timerRef.current)}
        required={required}
      />
    </div>
  );
}

function LineChart({ sessions }) {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  const data = {
    labels: sorted.map((s) => formatDate(s.date)),
    datasets: [{
      label: 'Earnings ($)',
      data: sorted.map((s) => Number(s.gross_earnings)),
      borderColor: '#00D4FF',
      backgroundColor: 'rgba(0,212,255,0.08)',
      borderWidth: 2,
      pointRadius: 3,
      fill: true,
      tension: 0.3,
    }],
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

// ── Zone creation form ────────────────────────────────────────────────────────

function ZoneForm({ onSaved, onError }) {
  const [form, setForm] = useState(emptyZoneForm());
  const [saving, setSaving] = useState(false);

  function toggleService(type) {
    setForm((f) => ({
      ...f,
      service_types: f.service_types.includes(type)
        ? f.service_types.filter((t) => t !== type)
        : [...f.service_types, type],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    onError('');
    setSaving(true);
    try {
      const body = {
        name:          form.name.trim(),
        zone_type:     form.zone_type     || null,
        address:       form.address.trim() || null,
        geo_lat:       form.geo_lat       ? Number(form.geo_lat)  : null,
        geo_lng:       form.geo_lng       ? Number(form.geo_lng)  : null,
        service_types: form.service_types.length ? form.service_types : null,
      };
      const r = await api.post('/metrics/zones', body);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || 'Could not add zone');
      }
      setForm(emptyZoneForm());
      onSaved();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const selectedDesc = form.zone_type ? ZONE_TYPE_DESCRIPTIONS[form.zone_type] : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Row 1: Name + Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="section-label block mb-1">Zone name *</label>
          <input
            type="text"
            className="arc-input"
            placeholder="e.g. Downtown, Airport North"
            maxLength={64}
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="section-label block mb-1">Zone type</label>
          <select
            className="arc-input"
            value={form.zone_type}
            onChange={(e) => setForm({ ...form, zone_type: e.target.value })}
          >
            <option value="">— select type —</option>
            {ZONE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {selectedDesc && (
            <p className="text-xs text-ink-400 mt-1 leading-relaxed">{selectedDesc}</p>
          )}
        </div>
      </div>

      {/* Row 2: Address + Geo */}
      <div>
        <label className="section-label block mb-1">
          Address
          <span className="text-ink-500 font-normal ml-1">— approximate zone center</span>
        </label>
        <input
          type="text"
          className="arc-input"
          placeholder="e.g. 3400 E Sky Harbor Blvd, Phoenix, AZ 85034"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="section-label block mb-1">
            Latitude
            <span className="text-ink-500 font-normal ml-1">— zone center</span>
          </label>
          <div className="relative">
            <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
            <input
              type="text"
              inputMode="decimal"
              className="arc-input pl-7"
              placeholder="33.437969"
              value={form.geo_lat}
              onChange={(e) => setForm({ ...form, geo_lat: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="section-label block mb-1">
            Longitude
            <span className="text-ink-500 font-normal ml-1">— zone center</span>
          </label>
          <div className="relative">
            <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
            <input
              type="text"
              inputMode="decimal"
              className="arc-input pl-7"
              placeholder="-112.007507"
              value={form.geo_lng}
              onChange={(e) => setForm({ ...form, geo_lng: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Service types */}
      <div>
        <label className="section-label block mb-2">Service types</label>
        <div className="flex gap-3">
          {SERVICE_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-obsidian-500 bg-obsidian-900 text-arc accent-arc"
                checked={form.service_types.includes(t)}
                onChange={() => toggleService(t)}
              />
              <span className="text-sm text-ink-200">{t}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={saving} className="btn-primary">
          <Plus size={14} />
          {saving ? 'Saving…' : 'Add zone'}
        </button>
      </div>
    </form>
  );
}

// ── Event zone form ───────────────────────────────────────────────────────────

function EventForm({ zones, onSaved, onError }) {
  const [form, setForm] = useState(emptyEventForm());
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    onError('');
    setSaving(true);
    try {
      const body = {
        zone_id:           form.zone_id,
        event_name:        form.event_name.trim(),
        activation_window: form.activation_window.trim(),
        impact:            form.impact,
        week_of:           form.week_of,
      };
      const r = await api.post('/metrics/zones/events', body);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || 'Could not add event');
      }
      setForm(emptyEventForm());
      onSaved();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="section-label block mb-1">Zone *</label>
          <select
            className="arc-input"
            required
            value={form.zone_id}
            onChange={(e) => setForm({ ...form, zone_id: e.target.value })}
          >
            <option value="">— select zone —</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
        <div>
          <label className="section-label block mb-1">Week of *</label>
          <input
            type="date"
            className="arc-input"
            required
            value={form.week_of}
            onChange={(e) => setForm({ ...form, week_of: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="section-label block mb-1">Event name *</label>
        <input
          type="text"
          className="arc-input"
          placeholder="e.g. Suns vs Lakers, Taylor Swift Night 2"
          maxLength={128}
          required
          value={form.event_name}
          onChange={(e) => setForm({ ...form, event_name: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="section-label block mb-1">Activation window *</label>
          <input
            type="text"
            className="arc-input"
            placeholder="e.g. 6:00 PM – 11:30 PM"
            required
            value={form.activation_window}
            onChange={(e) => setForm({ ...form, activation_window: e.target.value })}
          />
        </div>
        <div>
          <label className="section-label block mb-1">Impact *</label>
          <select
            className="arc-input"
            required
            value={form.impact}
            onChange={(e) => setForm({ ...form, impact: e.target.value })}
          >
            <option value="">— select —</option>
            {IMPACT_TYPES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={saving} className="btn-primary">
          <Plus size={14} />
          {saving ? 'Saving…' : 'Add event'}
        </button>
      </div>
    </form>
  );
}

// ── Maintenance constants ──────────────────────────────────────────────────────

const SERVICE_TYPE_LABELS = {
  oil_change:   'Oil Change',
  tire_rotation:'Tire Rotation',
  tires:        'Tire Replacement',
  brakes:       'Brakes',
  battery:      'Battery',
  inspection:   'Inspection',
  air_filter:   'Air Filter',
  alignment:    'Alignment',
  general:      'General Service',
  other:        'Other',
};

const CHECKLIST_TABS = [
  { key: 'pre_day',  label: 'Pre-Day' },
  { key: 'post_day', label: 'Post-Day' },
  { key: 'pre_trip', label: 'Pre-Trip' },
  { key: 'post_trip',label: 'Post-Trip' },
];

function emptyRecordForm() {
  return {
    service_date:   new Date().toISOString().slice(0, 10),
    shop_name:      "Jim's Garage",
    service_type:   '',
    description:    '',
    mileage:        '',
    cost:           '',
    next_due_miles: '',
    next_due_date:  '',
    notes:          '',
  };
}

// ── Service record form ────────────────────────────────────────────────────────

function RecordForm({ onSaved }) {
  const [form, setForm] = useState(emptyRecordForm());
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const body = {
      service_date:   form.service_date,
      shop_name:      form.shop_name.trim(),
      service_type:   form.service_type,
      description:    form.description.trim() || null,
      mileage:        form.mileage        ? Number(form.mileage)        : null,
      cost:           form.cost           ? Number(form.cost)           : null,
      next_due_miles: form.next_due_miles ? Number(form.next_due_miles) : null,
      next_due_date:  form.next_due_date  || null,
      notes:          form.notes.trim()   || null,
    };
    const r = await api.post('/metrics/maintenance/records', body);
    if (r.ok) { setForm(emptyRecordForm()); onSaved(); }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="section-label block mb-1">Date *</label>
          <input type="date" required className="arc-input"
            value={form.service_date}
            onChange={(e) => setForm({ ...form, service_date: e.target.value })} />
        </div>
        <div>
          <label className="section-label block mb-1">Shop *</label>
          <input type="text" required maxLength={128} className="arc-input"
            value={form.shop_name}
            onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
        </div>
        <div>
          <label className="section-label block mb-1">Service type *</label>
          <select required className="arc-input"
            value={form.service_type}
            onChange={(e) => setForm({ ...form, service_type: e.target.value })}>
            <option value="">— select —</option>
            {Object.entries(SERVICE_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="section-label block mb-1">Odometer (mi)</label>
          <input type="number" min={0} className="arc-input" placeholder="e.g. 48200"
            value={form.mileage}
            onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="section-label block mb-1">Cost ($)</label>
          <input type="number" min={0} step={0.01} className="arc-input" placeholder="0.00"
            value={form.cost}
            onChange={(e) => setForm({ ...form, cost: e.target.value })} />
        </div>
        <div>
          <label className="section-label block mb-1">Description</label>
          <input type="text" maxLength={256} className="arc-input" placeholder="e.g. Synthetic 5W-30"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="section-label block mb-1">Next due (mi)</label>
          <input type="number" min={0} className="arc-input" placeholder="e.g. 53200"
            value={form.next_due_miles}
            onChange={(e) => setForm({ ...form, next_due_miles: e.target.value })} />
        </div>
        <div>
          <label className="section-label block mb-1">Next due (date)</label>
          <input type="date" className="arc-input"
            value={form.next_due_date}
            onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="section-label block mb-1">Notes</label>
        <input type="text" className="arc-input" placeholder="Optional notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="btn-primary">
          <Plus size={14} /> {saving ? 'Saving…' : 'Add record'}
        </button>
      </div>
    </form>
  );
}

// ── Named checklist panel (collapsible wrapper for multi-checklist view) ──────

function ChecklistNamedPanel({ checklist, logs, onComplete, onAddItem }) {
  const [open, setOpen] = useState(false);
  const today   = new Date().toISOString().slice(0, 10);
  const todayLog = logs.find((l) => l.checklist_id === checklist.id && l.log_date === today);

  return (
    <div className="border border-obsidian-700/50 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-obsidian-800/40 text-left"
      >
        {open ? <ChevronUp size={13} className="text-ink-400 shrink-0" /> : <ChevronDown size={13} className="text-ink-400 shrink-0" />}
        <span className="text-sm text-ink-100 font-medium flex-1 truncate">{checklist.name}</span>
        {todayLog && <Check size={11} className="text-success shrink-0" />}
      </button>
      {open && (
        <div className="px-3 py-3 border-t border-obsidian-700/50">
          <ChecklistPanel
            checklist={checklist}
            logs={logs}
            onComplete={onComplete}
            onAddItem={onAddItem}
          />
        </div>
      )}
    </div>
  );
}

// ── Checklist panel ────────────────────────────────────────────────────────────

function ChecklistPanel({ checklist, logs, onComplete, onAddItem }) {
  const today    = new Date().toISOString().slice(0, 10);
  const items    = [...(checklist.items ?? [])].filter((i) => i.active).sort((a, b) => a.sort_order - b.sort_order);
  const clLogs   = logs.filter((l) => l.checklist_id === checklist.id);
  const todayLog = clLogs.find((l) => l.log_date === today);

  const [checked,  setChecked]  = useState(() => new Set(todayLog?.checked_ids ?? []));
  const [notes,    setNotes]    = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    const tl = logs.filter((l) => l.checklist_id === checklist.id).find((l) => l.log_date === today);
    setChecked(new Set(tl?.checked_ids ?? []));
  }, [logs, checklist.id, today]);

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleComplete() {
    setSaving(true);
    await onComplete(checklist.id, today, [...checked], notes.trim() || null);
    setNotes('');
    setSaving(false);
  }

  async function handleAddItem(e) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    await onAddItem(checklist.id, newLabel.trim(), items.length);
    setNewLabel('');
  }

  const allChecked = items.length > 0 && items.every((i) => checked.has(i.id));

  return (
    <div className="space-y-4">
      {/* Checklist items */}
      <div className="space-y-1">
        {items.length === 0 && (
          <p className="text-xs text-ink-400">No items yet — add one below.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group">
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className={`flex items-center gap-2 flex-1 text-left px-3 py-2 rounded-lg transition-colors ${
                checked.has(item.id)
                  ? 'bg-success/10 text-success'
                  : 'text-ink-200 hover:bg-obsidian-700/50'
              }`}
            >
              {checked.has(item.id)
                ? <CheckSquare size={14} className="shrink-0" />
                : <Square size={14} className="shrink-0 text-ink-500" />}
              <span className="text-sm">{item.label}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Complete button + notes */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 pt-1 border-t border-obsidian-700">
          <input
            type="text"
            className="arc-input flex-1 text-sm"
            placeholder="Optional notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            type="button"
            disabled={saving}
            onClick={handleComplete}
            className={`btn-primary text-xs gap-1.5 whitespace-nowrap ${allChecked ? '' : 'opacity-80'}`}
          >
            <Check size={12} />
            {saving ? 'Saving…' : todayLog ? 'Update' : 'Mark Complete'}
          </button>
        </div>
      )}

      {/* Add item */}
      <form onSubmit={handleAddItem} className="flex items-center gap-2">
        <input
          type="text"
          className="arc-input flex-1 text-xs"
          placeholder="Add checklist item…"
          maxLength={128}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <button type="submit" disabled={!newLabel.trim()} className="btn-ghost text-xs py-1.5 gap-1">
          <Plus size={11} /> Add
        </button>
      </form>

      {/* Recent completions */}
      {clLogs.length > 0 && (
        <div>
          <p className="section-label mb-1.5">Recent completions</p>
          <div className="space-y-1">
            {clLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-obsidian-900 text-xs">
                <span className="text-ink-300">{log.log_date}</span>
                <span className="text-ink-500">
                  {log.checked_ids.length}/{items.length} items
                </span>
                {log.notes && <span className="text-ink-500 truncate max-w-32">{log.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Today's checklist section (one checklist: pre or post) ────────────────────

function TodayChecklistSection({ label, checklist, log, todayStr, onComplete }) {
  const [checked,  setChecked]  = useState(() => new Set(log?.checked_ids ?? []));
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    setChecked(new Set(log?.checked_ids ?? []));
  }, [log]);

  const items = [...(checklist?.items ?? [])]
    .filter((i) => i.active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const logTime = log
    ? new Date(log.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  function toggleItem(id) {
    if (log) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!checklist) return;
    setSaving(true);
    await onComplete(checklist.id, [...checked], todayStr);
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="section-label">{label}</span>
        {log ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <Check size={11} /> {logTime}
          </span>
        ) : checklist ? (
          <span className="text-[10px] text-ink-500">{checked.size}/{items.length} checked</span>
        ) : null}
      </div>

      {!checklist ? (
        <p className="text-xs text-ink-500 italic">No checklist linked — set one in Schedule settings.</p>
      ) : (
        <>
          <p className="text-[11px] text-ink-400 -mt-1">{checklist.name}</p>
          <div className="space-y-1">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                className={`flex items-center gap-2 w-full text-left transition-opacity ${log ? 'cursor-default opacity-70' : 'hover:opacity-80'}`}
              >
                {checked.has(item.id)
                  ? <CheckSquare size={14} className="text-success shrink-0" />
                  : <Square size={14} className="text-ink-500 shrink-0" />}
                <span className={`text-sm ${checked.has(item.id) ? 'line-through text-ink-500' : 'text-ink-200'}`}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
          {!log && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || items.length === 0}
              className="btn-primary text-xs gap-1 self-start mt-1"
            >
              <ClipboardCheck size={12} /> {saving ? 'Logging…' : `Log ${label}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Today's panel ─────────────────────────────────────────────────────────────

function TodayPanel({ scheduleData, checklists, todayLogs, todayStr, onComplete }) {
  const preId  = scheduleData?.pre_day_checklist_id;
  const postId = scheduleData?.post_day_checklist_id;
  const preChecklist  = checklists.find((c) => c.id === preId)  ?? null;
  const postChecklist = checklists.find((c) => c.id === postId) ?? null;
  const preLog  = todayLogs.find((l) => l.checklist_id === preId)  ?? null;
  const postLog = todayLogs.find((l) => l.checklist_id === postId) ?? null;

  const dayLabel = new Date(todayStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  return (
    <div className="metal-card p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="section-label flex items-center gap-1.5">
            <ClipboardList size={13} /> Today's Checklists
          </p>
          <p className="text-xs text-ink-400 mt-0.5">{dayLabel}</p>
        </div>
        {scheduleData ? (
          <span className="text-[10px] px-2 py-0.5 rounded bg-arc/15 text-arc border border-arc/30">
            {scheduleData.name}
          </span>
        ) : (
          <span className="text-[10px] text-ink-500 italic">No schedule assigned today</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TodayChecklistSection
          label="Pre-Day"
          checklist={preChecklist}
          log={preLog}
          todayStr={todayStr}
          onComplete={onComplete}
        />
        <div className="hidden md:block w-px bg-obsidian-700 self-stretch" />
        <TodayChecklistSection
          label="Post-Day"
          checklist={postChecklist}
          log={postLog}
          todayStr={todayStr}
          onComplete={onComplete}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DrivingPage() {
  const [sessions, setSessions]       = useState([]);
  const [zones, setZones]             = useState([]);
  const [events, setEvents]           = useState([]);
  const [form, setForm]               = useState(getDefaultForm);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [showZoneMgr,  setShowZoneMgr]  = useState(false);
  const [zoneMgrTab,   setZoneMgrTab]   = useState('zones');
  const [zoneError,    setZoneError]    = useState('');
  const [showMaint,       setShowMaint]       = useState(false);
  const [maintTab,        setMaintTab]        = useState('records');
  const [checklistTab,    setChecklistTab]    = useState('pre_day');
  const [records,         setRecords]         = useState([]);
  const [checklists,      setChecklists]      = useState([]);
  const [checkLogs,       setCheckLogs]       = useState([]);
  const [todaySchedule,   setTodaySchedule]   = useState(null);  // null=loading, false=none, obj=schedule
  const [todayLogs,       setTodayLogs]       = useState([]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const loadSessions = useCallback(async () => {
    const r = await api.get('/metrics/driving-sessions?limit=200');
    if (r.ok) setSessions(await r.json());
  }, []);

  const loadZones = useCallback(async () => {
    const r = await api.get('/metrics/zones');
    if (r.ok) setZones(await r.json());
  }, []);

  const loadEvents = useCallback(async () => {
    const r = await api.get('/metrics/zones/events');
    if (r.ok) setEvents(await r.json());
  }, []);

  const loadRecords = useCallback(async () => {
    const r = await api.get('/metrics/maintenance/records');
    if (r.ok) setRecords(await r.json());
  }, []);

  const loadChecklists = useCallback(async () => {
    const r = await api.get('/metrics/maintenance/checklists');
    if (r.ok) setChecklists(await r.json());
  }, []);

  const loadChecklistLogs = useCallback(async () => {
    const r = await api.get('/metrics/maintenance/checklist-logs?limit=30');
    if (r.ok) setCheckLogs(await r.json());
  }, []);

  const loadTodayData = useCallback(async (today) => {
    const calR = await api.get(`/metrics/schedule/calendar/${today}`);
    if (!calR.ok) { setTodaySchedule(false); return; }
    const entry = await calR.json();
    const schedR = await api.get(`/metrics/schedule/schedules/${entry.schedule_id}`);
    if (schedR.ok) setTodaySchedule(await schedR.json());
    else setTodaySchedule(false);
  }, []);

  const loadTodayLogs = useCallback(async (today) => {
    const r = await api.get(`/metrics/maintenance/checklist-logs?log_date=${today}&limit=20`);
    if (r.ok) setTodayLogs(await r.json());
  }, []);

  useEffect(() => {
    loadSessions(); loadZones(); loadEvents();
    loadChecklists(); loadTodayData(todayStr); loadTodayLogs(todayStr);
  }, [loadSessions, loadZones, loadEvents, loadChecklists, loadTodayData, loadTodayLogs, todayStr]);

  useEffect(() => {
    if (showMaint) { loadRecords(); loadChecklistLogs(); }
  }, [showMaint, loadRecords, loadChecklistLogs]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        date:           form.date,
        gross_earnings: Number(form.gross_earnings) || 0,
        trip_count:     Number(form.trip_count) || 0,
        zone_id:        form.zone_id || null,
        start_time:     form.start_time || null,
        end_time:       form.end_time   || null,
        odometer_start: form.odometer_start ? Number(form.odometer_start) : null,
        odometer_end:   form.odometer_end   ? Number(form.odometer_end)   : null,
      };
      const r = await api.post('/metrics/driving-sessions', body);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || 'Save failed');
      }
      setForm(getDefaultForm());
      await loadSessions();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    await api.delete(`/metrics/driving-sessions/${id}`);
    await loadSessions();
  }

  async function handleDeleteZone(id) {
    await api.delete(`/metrics/zones/${id}`);
    await loadZones();
  }

  async function handleDeleteEvent(id) {
    await api.delete(`/metrics/zones/events/${id}`);
    await loadEvents();
  }

  function zoneName(zoneId) {
    return zones.find((z) => z.id === zoneId)?.name ?? zoneId;
  }

  async function handleDeleteRecord(id) {
    await api.delete(`/metrics/maintenance/records/${id}`);
    loadRecords();
  }

  async function handleCompleteChecklist(checklistId, checkedIds, logDate, notes) {
    await api.post('/metrics/maintenance/checklist-logs', {
      checklist_id: checklistId,
      log_date:     logDate ?? todayStr,
      checked_ids:  checkedIds,
      notes:        notes ?? null,
    });
    loadTodayLogs(todayStr);
    if (showMaint) loadChecklistLogs();
  }

  async function handleAddChecklistItem(checklistId, label, sortOrder) {
    await api.post(`/metrics/maintenance/checklists/${checklistId}/items`, {
      label,
      sort_order: sortOrder,
    });
    loadChecklists();
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title">Driving Sessions</h1>

      {/* Today's checklists */}
      <TodayPanel
        scheduleData={todaySchedule || null}
        checklists={checklists}
        todayLogs={todayLogs}
        todayStr={todayStr}
        onComplete={handleCompleteChecklist}
      />

      {sessions.length > 0 && (
        <div className="metal-card p-4">
          <p className="section-label mb-3">Earnings — last 30 sessions</p>
          <LineChart sessions={sessions} />
        </div>
      )}

      {/* Log form */}
      <div className="metal-card p-5">
        <p className="section-label mb-4">Log a session</p>
        {error && (
          <div className="flex items-center gap-2 text-error text-sm mb-3">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="section-label block mb-1">Date *</label>
            <input type="date" className="arc-input" required
              value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Gross *</label>
            <CurrencyInput
              required
              value={form.gross_earnings}
              onChange={(v) => setForm({ ...form, gross_earnings: v })}
            />
          </div>
          <div>
            <label className="section-label block mb-1">Trips</label>
            <input type="number" min="0" step="1" className="arc-input" placeholder="0"
              value={form.trip_count} onChange={(e) => setForm({ ...form, trip_count: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Zone</label>
            <select className="arc-input" value={form.zone_id} onChange={(e) => setForm({ ...form, zone_id: e.target.value })}>
              <option value="">— select —</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>

          <div>
            <label className="section-label block mb-1">Start time</label>
            <input type="time" className="arc-input"
              value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">End time</label>
            <input type="time" className="arc-input"
              value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Odo start (mi)</label>
            <input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" className="arc-input"
              value={form.odometer_start} onChange={(e) => setForm({ ...form, odometer_start: e.target.value })} />
          </div>
          <div>
            <label className="section-label block mb-1">Odo end (mi)</label>
            <input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" className="arc-input"
              value={form.odometer_end} onChange={(e) => setForm({ ...form, odometer_end: e.target.value })} />
          </div>

          <div className="col-span-2 md:col-span-4 flex justify-end pt-1">
            <button type="submit" disabled={saving} className="btn-primary">
              <Plus size={14} />
              {saving ? 'Saving…' : 'Add session'}
            </button>
          </div>
        </form>
      </div>

      {/* Zone management */}
      <div className="metal-card">
        <button
          type="button"
          onClick={() => setShowZoneMgr((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm text-ink-200 hover:text-ink-50 transition-colors"
        >
          <span className="section-label">Zone management</span>
          {showZoneMgr ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showZoneMgr && (
          <div className="px-5 pb-5 space-y-5">
            {/* Tab bar */}
            <div className="flex gap-1 border-b border-obsidian-600">
              {[
                { key: 'zones',  label: 'Zones',          icon: MapPin },
                { key: 'events', label: 'Event Schedule',  icon: Calendar },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setZoneMgrTab(key); setZoneError(''); }}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    zoneMgrTab === key
                      ? 'border-arc text-arc'
                      : 'border-transparent text-ink-400 hover:text-ink-200'
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>

            {zoneError && (
              <p className="text-error text-xs flex items-center gap-1">
                <AlertCircle size={12} /> {zoneError}
              </p>
            )}

            {/* ── Zones tab ── */}
            {zoneMgrTab === 'zones' && (
              <div className="space-y-5">
                <ZoneForm onSaved={loadZones} onError={setZoneError} />

                {zones.length === 0 ? (
                  <p className="text-ink-400 text-sm">No zones yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {zones.map((z) => (
                      <div key={z.id} className="flex items-start justify-between px-3 py-2.5 rounded-lg bg-obsidian-900 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-ink-200">{z.name}</span>
                            {z.zone_type && (
                              <span className="text-xs text-ink-400">{z.zone_type}</span>
                            )}
                            {z.service_types?.map((s) => (
                              <span key={s} className="text-xs text-ink-400">{s}</span>
                            ))}
                          </div>
                          {z.address && (
                            <p className="text-xs text-ink-400 mt-0.5 truncate">{z.address}</p>
                          )}
                          {(z.geo_lat || z.geo_lng) && (
                            <p className="text-xs text-ink-400 mt-0.5 font-mono opacity-50">
                              {z.geo_lat}, {z.geo_lng}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteZone(z.id)}
                          className="text-ink-500 hover:text-error transition-colors shrink-0 mt-0.5"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Event Schedule tab ── */}
            {zoneMgrTab === 'events' && (
              <div className="space-y-5">
                {zones.length === 0 ? (
                  <p className="text-ink-400 text-sm">Add a zone first before scheduling events.</p>
                ) : (
                  <EventForm zones={zones} onSaved={loadEvents} onError={setZoneError} />
                )}

                {events.length === 0 ? (
                  <p className="text-ink-400 text-sm">No events scheduled.</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...events].sort((a, b) => a.week_of.localeCompare(b.week_of)).map((ev) => (
                      <div key={ev.id} className="flex items-start justify-between px-3 py-2.5 rounded-lg bg-obsidian-900 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-ink-200">{ev.event_name}</span>
                            <span className={`text-xs ${
                              ev.impact === 'High Surge' ? 'text-yellow-600' : 'text-ink-400'
                            }`}>{ev.impact}</span>
                          </div>
                          <p className="text-xs text-ink-400 mt-0.5">
                            {zoneName(ev.zone_id)} &middot; Week of {formatDate(ev.week_of)}
                          </p>
                          <p className="text-xs text-ink-400 mt-0.5 opacity-60">{ev.activation_window}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(ev.id)}
                          className="text-ink-500 hover:text-error transition-colors shrink-0 mt-0.5"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Maintenance & Checklists */}
      <div className="metal-card">
        <button
          type="button"
          onClick={() => setShowMaint((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm text-ink-200 hover:text-ink-50 transition-colors"
        >
          <span className="flex items-center gap-2 section-label">
            <Wrench size={13} /> Maintenance &amp; Checklists
          </span>
          {showMaint ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showMaint && (
          <div className="px-5 pb-5 space-y-5">
            {/* Tab bar */}
            <div className="flex gap-1 border-b border-obsidian-600">
              {[
                { key: 'records',    label: 'Service Records', icon: Wrench },
                { key: 'checklists', label: 'Checklists',      icon: ClipboardList },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMaintTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                    maintTab === key
                      ? 'border-arc text-arc'
                      : 'border-transparent text-ink-400 hover:text-ink-200'
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>

            {/* ── Service Records tab ── */}
            {maintTab === 'records' && (
              <div className="space-y-5">
                <RecordForm onSaved={loadRecords} />

                {records.length === 0 ? (
                  <p className="text-ink-400 text-sm">No service records yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-obsidian-700">
                          {['Date', 'Shop', 'Service', 'Odometer', 'Cost', 'Next Due', ''].map((h) => (
                            <th key={h} className="text-left section-label px-3 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r) => (
                          <tr key={r.id} className="border-b border-obsidian-700/40 hover:bg-obsidian-800/30 transition-colors">
                            <td className="px-3 py-2.5 text-ink-100 whitespace-nowrap">{r.service_date}</td>
                            <td className="px-3 py-2.5 text-ink-300">{r.shop_name}</td>
                            <td className="px-3 py-2.5">
                              <span className="text-ink-200">{SERVICE_TYPE_LABELS[r.service_type] ?? r.service_type}</span>
                              {r.description && <span className="text-ink-500 text-xs ml-1">— {r.description}</span>}
                            </td>
                            <td className="px-3 py-2.5 text-ink-400 font-mono text-xs">
                              {r.mileage != null ? `${r.mileage.toLocaleString()} mi` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-arc">
                              {r.cost != null ? `$${Number(r.cost).toFixed(2)}` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-ink-400 text-xs">
                              {r.next_due_miles
                                ? <span>{r.next_due_miles.toLocaleString()} mi</span>
                                : r.next_due_date
                                ? <span>{r.next_due_date}</span>
                                : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => handleDeleteRecord(r.id)}
                                className="text-ink-500 hover:text-error transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Checklists tab ── */}
            {maintTab === 'checklists' && (
              <div className="space-y-4">
                {/* Checklist type sub-tabs */}
                <div className="flex gap-1 flex-wrap">
                  {CHECKLIST_TABS.map(({ key, label }) => {
                    const today = new Date().toISOString().slice(0, 10);
                    const typeChecklists = checklists.filter((c) => c.checklist_type === key);
                    const todayLog = checkLogs.find(
                      (l) => typeChecklists.some((c) => c.id === l.checklist_id) && l.log_date === today
                    );
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setChecklistTab(key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          checklistTab === key
                            ? 'bg-arc/15 text-arc'
                            : 'text-ink-400 hover:text-ink-200 hover:bg-obsidian-700/50'
                        }`}
                      >
                        {todayLog && <Check size={10} className="text-success" />}
                        {label}
                      </button>
                    );
                  })}
                </div>

                {(() => {
                  const typeChecklists = checklists.filter((c) => c.checklist_type === checklistTab);
                  if (typeChecklists.length === 0) {
                    return <p className="text-xs text-ink-400">No checklists of this type. Add one from the Data page.</p>;
                  }
                  if (typeChecklists.length === 1) {
                    return (
                      <ChecklistPanel
                        key={typeChecklists[0].id}
                        checklist={typeChecklists[0]}
                        logs={checkLogs}
                        onComplete={handleCompleteChecklist}
                        onAddItem={handleAddChecklistItem}
                      />
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {typeChecklists.map((cl) => (
                        <ChecklistNamedPanel
                          key={cl.id}
                          checklist={cl}
                          logs={checkLogs}
                          onComplete={handleCompleteChecklist}
                          onAddItem={handleAddChecklistItem}
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sessions table */}
      {sessions.length > 0 && (
        <div className="metal-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                {['Date', 'Time', 'Duration', 'Miles', 'Gross', 'Trips', 'Zone', ''].map((h) => (
                  <th key={h} className="text-left section-label px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...sessions].sort((a, b) => b.date.localeCompare(a.date)).map((s) => (
                <tr key={s.id} className="border-b border-obsidian-600/50 hover:bg-obsidian-700/30 transition-colors">
                  <td className="px-4 py-3 text-ink-50">{formatDate(s.date)}</td>
                  <td className="px-4 py-3 text-ink-300 whitespace-nowrap">
                    {s.start_time ? `${fmt12(s.start_time)} → ${fmt12(s.end_time)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-200">
                    {s.duration_hours != null ? `${round1(s.duration_hours)}h` : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-200">
                    {s.miles_driven != null ? `${s.miles_driven} mi` : '—'}
                  </td>
                  <td className="px-4 py-3 text-arc">{formatCurrency(s.gross_earnings)}</td>
                  <td className="px-4 py-3 text-ink-200">{s.trip_count || '—'}</td>
                  <td className="px-4 py-3 text-ink-300">{s.zone_name ?? '—'}</td>
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
