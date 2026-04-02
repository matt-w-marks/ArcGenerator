import { useEffect, useRef, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  format, addDays, startOfWeek, isToday, isSameDay, addWeeks, subWeeks,
} from 'date-fns';
import {
  ChevronLeft, ChevronRight, Plus, Trash2,
  MapPin, Zap, Briefcase, Coffee, StickyNote, Check, ChevronsUpDown, Pencil, Save, ClipboardCheck,
} from 'lucide-react';
import { api } from '../lib/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_H   = 56;
const TIME_COL = 56;

const BLOCK_STYLES = {
  zone:      'bg-arc/15 border-arc/40 text-arc',
  event:     'bg-ember/15 border-ember/40 text-ember',
  job:       'bg-neural/15 border-neural/40 text-neural',
  rest:      'bg-obsidian-700 border-obsidian-500 text-ink-300',
  note:      'bg-success/10 border-success/30 text-success',
  checklist: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
};

const BLOCK_ICONS = {
  zone:      MapPin,
  event:     Zap,
  job:       Briefcase,
  rest:      Coffee,
  note:      StickyNote,
  checklist: ClipboardCheck,
};

const ZONE_TYPE_ORDER = ['Anchor', 'Core', 'Steady', 'Events', 'Surge'];

const JOB_PRESETS = [
  'Notary Appt',
  'Outreach Session',
  'Recruiter Call',
  'Interview',
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function platformBlockStyle(colors) {
  if (!colors || colors.length === 0) return null;
  // Inset left accent bar at full brand color — visible on any dark bg
  // Multiple colors stack as 2px each side-by-side
  const shadows = colors
    .map((hex, i) => `inset ${3 + i * 3}px 0 0 ${i === 0 ? hex : hexToRgba(hex, 0.85)}`)
    .join(', ');
  return {
    backgroundColor: hexToRgba(colors[0], 0.15),
    borderColor:     hexToRgba(colors[0], 0.45),
    boxShadow:       shadows,
  };
}

function toDateStr(d) {
  return format(d, 'yyyy-MM-dd');
}

function fmt12h(h) {
  // Support 0.5-hour increments and overnight hours (24=midnight, 25=1AM, 26=2AM)
  const h24   = h % 24;
  const hr    = Math.floor(h24);
  const half  = h24 % 1 !== 0;
  const m     = half ? ':30' : '';
  if (hr === 0)  return `12${m} AM`;
  if (hr === 12) return `12${m} PM`;
  return hr < 12 ? `${hr}${m} AM` : `${hr - 12}${m} PM`;
}

function weekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

// ── Drag ghost ────────────────────────────────────────────────────────────────

function DragGhost({ label, blockType }) {
  const style = BLOCK_STYLES[blockType] || BLOCK_STYLES.note;
  return (
    <div className={`px-3 py-1.5 rounded-lg border text-xs font-medium opacity-90 pointer-events-none ${style}`}>
      {label}
    </div>
  );
}

// ── Palette item ──────────────────────────────────────────────────────────────

function PaletteItem({ id, label, blockType, badge, badgeTitle }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  const Icon  = BLOCK_ICONS[blockType] || StickyNote;
  const style = BLOCK_STYLES[blockType] || BLOCK_STYLES.note;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs cursor-grab select-none transition-opacity ${style} ${isDragging ? 'opacity-30' : 'opacity-80 hover:opacity-100'}`}
    >
      {badge != null ? (
        <span
          title={badgeTitle}
          className="shrink-0 w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center bg-current/20 leading-none"
        >
          {badge}
        </span>
      ) : (
        <Icon size={11} className="shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </div>
  );
}

// ── Hour row (droppable) ──────────────────────────────────────────────────────

function TimelineDropZone({ hour }) {
  const { setNodeRef, isOver } = useDroppable({ id: `hour:${hour}` });
  const isHalf = hour % 1 !== 0;
  return (
    <div ref={setNodeRef} style={{ height: HOUR_H / 2, position: 'relative' }}>
      <div
        style={{ height: HOUR_H / 2 }}
        className={`flex ${isHalf ? 'border-b border-dashed border-obsidian-700/30' : 'border-b border-obsidian-700/60'} transition-colors ${isOver ? 'bg-arc/5' : ''}`}
      >
        <div
          style={{ width: TIME_COL }}
          className="shrink-0 flex items-start justify-end pr-3 pt-1"
        >
          {isHalf
            ? <span className="text-[8px] text-ink-600 font-mono">:30</span>
            : <span className="text-[10px] text-ink-500 font-mono">{fmt12h(hour)}</span>
          }
        </div>
        <div className="flex-1 border-l border-obsidian-700/40" />
      </div>
    </div>
  );
}

// ── Placed block ──────────────────────────────────────────────────────────────

function TimelineBlock({ block, anchorRank, onDelete, onResize, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `block:${block.id}`,
  });
  const Icon          = BLOCK_ICONS[block.block_type] || StickyNote;
  const typeClass     = BLOCK_STYLES[block.block_type] || BLOCK_STYLES.note;
  const hasPlatform   = block.platform_colors && block.platform_colors.length > 0;
  const platformStyle = hasPlatform ? platformBlockStyle(block.platform_colors) : null;
  const dur           = block.hour_end - block.hour_start;
  const top    = block.hour_start * HOUR_H;
  const height = dur * HOUR_H - 4;
  const resizing  = useRef(false);
  const startY    = useRef(0);
  const startEnd  = useRef(block.hour_end);

  function handleResizeStart(e) {
    e.stopPropagation();
    e.preventDefault();
    resizing.current = true;
    startY.current   = e.clientY;
    startEnd.current = block.hour_end;

    function onMove(ev) {
      if (!resizing.current) return;
      const delta     = ev.clientY - startY.current;
      const hourDelta = Math.round(delta / (HOUR_H / 2)) * 0.5; // snap to 0.5h
      const newEnd    = Math.max(block.hour_start + 0.5, Math.min(26, startEnd.current + hourDelta));
      onResize(block.id, newEnd);
    }
    function onUp() {
      resizing.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border px-2 py-1 cursor-grab overflow-hidden group ${typeClass}`}
      style={{
        position:  'absolute',
        top:       top + 2,
        left:      TIME_COL + 4,
        right:     8,
        height,
        zIndex:    isDragging ? 0 : 10,
        opacity:   isDragging ? 0.2 : 1,
        transform: CSS.Transform.toString(transform),
        ...(platformStyle ?? {}),
      }}
      {...listeners}
      {...attributes}
    >
      {/* Header row */}
      <div className="flex items-start gap-1 min-w-0">
        {anchorRank != null ? (
          <span className="shrink-0 w-3.5 h-3.5 rounded text-[8px] font-bold flex items-center justify-center bg-current/20 leading-none mt-0.5">
            {anchorRank}
          </span>
        ) : (
          <Icon size={10} className="shrink-0 mt-0.5" />
        )}
        {/* Clickable label opens edit modal */}
        <span
          className="text-[11px] font-medium leading-tight truncate flex-1 cursor-pointer hover:underline underline-offset-2 decoration-current/40"
          onClick={(e) => { e.stopPropagation(); onEdit(block); }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {block.label}
        </span>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Remove block"
            className="rounded p-0.5 hover:bg-current/20 transition-colors"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Platform placards */}
      {block.platform_colors?.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-0.5">
          {block.platform_colors.map((color, i) => (
            <span
              key={color + i}
              className="text-[8px] font-bold px-1 py-px rounded leading-tight shrink-0 tracking-tight"
              style={{
                backgroundColor: hexToRgba(color, 0.22),
                color,
                border: `1px solid ${hexToRgba(color, 0.60)}`,
              }}
            >
              {block.platform_names?.[i] ?? ''}
            </span>
          ))}
        </div>
      )}

      {/* Start time + gross */}
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-[9px] opacity-50 font-mono">{fmt12h(block.hour_start)}</span>
        {block.actual_gross != null ? (
          <span className="text-[9px] font-semibold opacity-90">
            ${Number(block.actual_gross).toFixed(0)}
          </span>
        ) : block.gross_revenue > 0 ? (
          <span className="text-[9px] opacity-40">
            ~${Number(block.gross_revenue).toFixed(0)}
          </span>
        ) : null}
      </div>

      {/* Notes preview */}
      {dur > 1.5 && block.notes && (
        <p className="text-[10px] opacity-50 mt-0.5 truncate">{block.notes}</p>
      )}

      {/* Resize handle — always slightly visible, pointer events to bypass dnd-kit */}
      <div
        className="absolute bottom-0 left-0 right-0 h-4 cursor-ns-resize flex items-end justify-center pb-1 opacity-30 group-hover:opacity-70 hover:opacity-100 transition-opacity"
        onPointerDown={handleResizeStart}
      >
        <div className="w-10 h-0.5 rounded-full bg-current" />
      </div>
    </div>
  );
}

// ── Week strip (assignment view) ──────────────────────────────────────────────

function WeekStrip({ weekStart, onWeekChange, assignedDates, onToggleDate, schedules, calendarEntries, weekLogs, disabled }) {
  const days = weekDays(weekStart);

  // Build a map: dateStr → {preTime, postTime} from weekLogs
  function getLogTimes(ds) {
    // Find which schedule is on this day
    const entry = calendarEntries.find((e) => e.entry_date === ds);
    if (!entry) return { preTime: null, postTime: null };
    const sched = schedules.find((s) => s.id === entry.schedule_id);
    if (!sched) return { preTime: null, postTime: null };

    function logTime(checklistId) {
      if (!checklistId) return null;
      const log = weekLogs.find((l) => l.checklist_id === checklistId && l.log_date === ds);
      if (!log) return null;
      return new Date(log.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    return {
      preTime:  logTime(sched.pre_day_checklist_id),
      postTime: logTime(sched.post_day_checklist_id),
    };
  }

  return (
    <div className="flex items-center gap-1 metal-card px-4 py-2">
      <button type="button" onClick={() => onWeekChange(-1)} className="p-1 text-ink-400 hover:text-ink-50 transition-colors">
        <ChevronLeft size={14} />
      </button>
      <div className="flex flex-1 gap-1">
        {days.map((day) => {
          const ds       = toDateStr(day);
          const assigned = assignedDates.has(ds);
          const today    = isToday(day);
          const { preTime, postTime } = getLogTimes(ds);
          return (
            <button
              key={ds}
              type="button"
              disabled={disabled}
              onClick={() => onToggleDate(day, assigned)}
              title={disabled ? 'Select a schedule first' : assigned ? 'Remove from this day' : 'Assign to this day'}
              className={`flex-1 flex flex-col items-center py-1 rounded-lg transition-all ${
                disabled
                  ? 'text-ink-600 cursor-not-allowed opacity-40'
                  : assigned
                  ? 'bg-arc/15 text-arc ring-1 ring-arc/30'
                  : today
                  ? 'text-ink-50 bg-obsidian-700 hover:bg-arc/10 hover:text-arc'
                  : 'text-ink-400 hover:text-ink-200 hover:bg-obsidian-700/50'
              }`}
            >
              <span className="text-[10px] uppercase tracking-wide">{format(day, 'EEE')}</span>
              <span className="text-sm font-semibold">{format(day, 'd')}</span>
              <div className="mt-0.5 flex flex-col items-center gap-px" style={{ minHeight: 28 }}>
                {assigned && <Check size={10} className="text-arc" />}
                {preTime  && <span className="text-[8px] text-success leading-none font-mono">▲{preTime}</span>}
                {postTime && <span className="text-[8px] text-success leading-none font-mono">▼{postTime}</span>}
              </div>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => onWeekChange(1)} className="p-1 text-ink-400 hover:text-ink-50 transition-colors">
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ── New schedule modal ────────────────────────────────────────────────────────

function NewScheduleModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="metal-card p-6 w-80 space-y-4">
        <h3 className="page-title text-base">New schedule</h3>
        <div>
          <label className="section-label block mb-1">Name *</label>
          <input
            autoFocus
            type="text"
            className="arc-input"
            placeholder="e.g. PHX Airport Morning"
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSave(name.trim(), desc.trim() || null); }}
          />
        </div>
        <div>
          <label className="section-label block mb-1">Description</label>
          <input
            type="text"
            className="arc-input"
            placeholder="Optional note"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onSave(name.trim(), desc.trim() || null)}
            className="btn-primary"
          >
            <Plus size={13} /> Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Custom job modal ──────────────────────────────────────────────────────────

function CustomJobModal({ onAdd, onClose }) {
  const [label, setLabel] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="metal-card p-5 w-72 space-y-3">
        <h3 className="text-sm font-semibold text-ink-50">Custom contract activity</h3>
        <input
          autoFocus
          type="text"
          className="arc-input"
          placeholder="e.g. Notary - 456 Oak Ave"
          maxLength={128}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) onAdd(label.trim()); }}
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button
            type="button"
            disabled={!label.trim()}
            onClick={() => onAdd(label.trim())}
            className="btn-primary text-xs"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Schedule picker dropdown ───────────────────────────────────────────────────

function SchedulePicker({ schedules, activeId, onChange, onNew }) {
  const [open, setOpen] = useState(false);
  const active = schedules.find((s) => s.id === activeId);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-obsidian-800 border border-obsidian-600 text-sm text-ink-100 hover:border-obsidian-500 transition-colors min-w-48 max-w-64"
      >
        <span className="flex-1 text-left truncate">
          {active ? active.name : <span className="text-ink-400">Select a schedule…</span>}
        </span>
        <ChevronsUpDown size={13} className="text-ink-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 z-30 bg-obsidian-800 border border-obsidian-600 rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {schedules.length === 0 && (
              <p className="px-3 py-3 text-xs text-ink-400">No schedules yet — create one below.</p>
            )}
            {schedules.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onChange(s.id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                  s.id === activeId
                    ? 'bg-arc/10 text-arc'
                    : 'text-ink-200 hover:bg-obsidian-700'
                }`}
              >
                {s.id === activeId && <Check size={12} className="shrink-0" />}
                <span className="flex-1 truncate">{s.name}</span>
                {s.description && (
                  <span className="text-[10px] text-ink-500 shrink-0 truncate max-w-24">{s.description}</span>
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-obsidian-600 p-2">
            <button
              type="button"
              onClick={() => { setOpen(false); onNew(); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-ink-300 hover:bg-obsidian-700 hover:text-ink-50 transition-colors"
            >
              <Plus size={12} /> New schedule…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Block edit modal ──────────────────────────────────────────────────────────

const DURATION_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10, 12];

const TIME_OPTIONS = Array.from({ length: 53 }, (_, i) => {
  const h = i * 0.5; // 0 to 26 in 0.5h steps
  return { value: h, label: fmt12h(h) + (h >= 24 ? ' (next day)' : '') };
});

const REVENUE_BLOCKS = ['zone', 'event', 'job'];

function BlockEditModal({ block, zones, platforms, onSave, onClose }) {
  const initDur = Number(block.hour_end) - Number(block.hour_start);
  const [startTime,    setStartTime]    = useState(Number(block.hour_start));
  const [duration,     setDuration]     = useState(
    DURATION_OPTIONS.includes(initDur) ? initDur : Math.max(0.5, initDur)
  );
  const [notes,        setNotes]        = useState(block.notes ?? '');
  const [zoneId,       setZoneId]       = useState(block.zone_id ?? '');
  const [platformIds,  setPlatformIds]  = useState(() => new Set(block.platform_ids ?? []));
  const [grossRevenue, setGrossRevenue] = useState(Number(block.gross_revenue ?? 0));
  const [actualGross,  setActualGross]  = useState(
    block.actual_gross != null ? Number(block.actual_gross) : ''
  );

  const canEarnRevenue = REVENUE_BLOCKS.includes(block.block_type);

  function handleSave() {
    const updates = {
      hour_start:    startTime,
      hour_end:      Math.min(26, startTime + duration),
      notes:         notes.trim() || null,
      platform_ids:  [...platformIds],
      gross_revenue: canEarnRevenue ? grossRevenue : 0,
      actual_gross:  canEarnRevenue && actualGross !== '' ? Number(actualGross) : null,
    };
    if (block.block_type === 'zone') updates.zone_id = zoneId || null;
    onSave(block.id, updates);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="metal-card p-5 w-80 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-50 truncate">{block.label}</h3>
          <p className="text-[10px] text-ink-500 mt-0.5 capitalize">{block.block_type} block</p>
        </div>

        {/* Start time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="section-label block mb-1">Start time</label>
            <select
              className="arc-input"
              value={startTime}
              onChange={(e) => setStartTime(Number(e.target.value))}
            >
              {TIME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="section-label block mb-1">Duration (hrs)</label>
            <select
              className="arc-input"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>{d}h</option>
              ))}
            </select>
          </div>
        </div>

        {/* End time preview */}
        <p className="text-[10px] text-ink-500 -mt-2">
          {fmt12h(startTime)} — {fmt12h(Math.min(26, startTime + duration))}
          {' '}({duration}h)
        </p>

        {/* Zone picker */}
        {block.block_type === 'zone' && (
          <div>
            <label className="section-label block mb-1">Zone</label>
            <select
              className="arc-input"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
            >
              <option value="">— none —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Platform picker — multi-select toggle */}
        {canEarnRevenue && (
          <div>
            <label className="section-label block mb-1">Platform</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setPlatformIds(new Set())}
                className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                  platformIds.size === 0
                    ? 'border-ink-400 bg-ink-400/10 text-ink-100'
                    : 'border-obsidian-600 text-ink-500 hover:border-obsidian-500'
                }`}
              >
                None
              </button>
              {platforms.map((p) => {
                const active = platformIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatformIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                      return next;
                    })}
                    className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${
                      active ? 'text-white ring-1' : 'border-obsidian-600 text-ink-400 hover:border-obsidian-500'
                    }`}
                    style={active
                      ? { backgroundColor: p.color, borderColor: p.color, ringColor: p.color }
                      : {}}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Gross revenue — estimated and actual side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="section-label block mb-1">
              Est. gross ($){!canEarnRevenue && <span className="ml-1 opacity-40">n/a</span>}
            </label>
            <input
              type="number"
              className="arc-input"
              min={0}
              step={5}
              disabled={!canEarnRevenue}
              value={grossRevenue}
              onChange={(e) => setGrossRevenue(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="section-label block mb-1">
              Actual gross ($){!canEarnRevenue && <span className="ml-1 opacity-40">n/a</span>}
            </label>
            <input
              type="number"
              className="arc-input"
              min={0}
              step={0.01}
              disabled={!canEarnRevenue}
              placeholder="—"
              value={actualGross}
              onChange={(e) => setActualGross(e.target.value)}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="section-label block mb-1">Notes</label>
          <textarea
            className="arc-input resize-none"
            rows={3}
            placeholder="Add notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button type="button" onClick={handleSave} className="btn-primary text-xs gap-1.5">
            <Save size={12} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [weekStart,       setWeekStart]       = useState(() => startOfWeek(today, { weekStartsOn: 1 }));
  const [schedules,       setSchedules]       = useState([]);
  const [activeId,        setActiveId]        = useState(null);
  const [blocks,          setBlocks]          = useState([]);
  const [zones,           setZones]           = useState([]);
  const [platforms,       setPlatforms]       = useState([]);
  const [allChecklists,   setAllChecklists]   = useState([]);
  const [assignedDates,   setAssignedDates]   = useState(new Set());
  const [calendarEntries, setCalendarEntries] = useState([]);  // all entries for visible month
  const [weekLogs,        setWeekLogs]        = useState([]);  // checklist logs for the visible week
  const [activeDrag,      setActiveDrag]      = useState(null);
  const [resizeMap,       setResizeMap]       = useState({});
  const [showNew,         setShowNew]         = useState(false);
  const [customJob,       setCustomJob]       = useState(false);
  const [editingBlock,    setEditingBlock]    = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const activeSchedule = schedules.find((s) => s.id === activeId) ?? null;

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadSchedules = useCallback(async () => {
    const r = await api.get('/metrics/schedule/schedules');
    if (r.ok) {
      const list = await r.json();
      setSchedules(list);
      return list;
    }
    return [];
  }, []);

  const loadZones = useCallback(async () => {
    const r = await api.get('/metrics/zones');
    if (r.ok) setZones(await r.json());
  }, []);

  const loadPlatforms = useCallback(async () => {
    const r = await api.get('/metrics/platforms');
    if (r.ok) setPlatforms(await r.json());
  }, []);

  const loadAllChecklists = useCallback(async () => {
    const r = await api.get('/metrics/maintenance/checklists');
    if (r.ok) setAllChecklists(await r.json());
  }, []);

  // Load blocks for the selected schedule
  const loadBlocks = useCallback(async (scheduleId) => {
    if (!scheduleId) { setBlocks([]); return; }
    const r = await api.get(`/metrics/schedule/schedules/${scheduleId}`);
    if (r.ok) {
      const s = await r.json();
      setBlocks(s.blocks ?? []);
    }
  }, []);

  // Load which days in the current week are assigned to the active schedule
  const loadAssignedDates = useCallback(async (schedId, ws) => {
    const days = weekDays(ws);
    const monthStr = format(days[0], 'yyyy-MM');
    const r = await api.get(`/metrics/schedule/calendar?month=${monthStr}`);
    if (r.ok) {
      const entries = await r.json();
      setCalendarEntries(entries);
      if (schedId) {
        setAssignedDates(new Set(
          entries.filter((e) => e.schedule_id === schedId).map((e) => e.entry_date)
        ));
      } else {
        setAssignedDates(new Set());
      }
    }
  }, []);

  const loadWeekLogs = useCallback(async (ws) => {
    const days = weekDays(ws);
    const from = toDateStr(days[0]);
    const to   = toDateStr(days[6]);
    // Fetch logs for the week via date range (use limit=50, filter client-side)
    const r = await api.get(`/metrics/maintenance/checklist-logs?limit=50`);
    if (r.ok) {
      const logs = await r.json();
      setWeekLogs(logs.filter((l) => l.log_date >= from && l.log_date <= to));
    }
  }, []);

  useEffect(() => { loadZones(); loadPlatforms(); loadAllChecklists(); }, [loadZones, loadPlatforms, loadAllChecklists]);

  useEffect(() => {
    loadSchedules().then((list) => {
      if (list.length > 0 && !activeId) setActiveId(list[0].id);
    });
  }, [loadSchedules]);

  useEffect(() => {
    loadBlocks(activeId);
    setResizeMap({});
  }, [activeId, loadBlocks]);

  useEffect(() => {
    loadAssignedDates(activeId, weekStart);
    loadWeekLogs(weekStart);
  }, [activeId, weekStart, loadAssignedDates, loadWeekLogs]);

  // ── Week navigation ───────────────────────────────────────────────────────

  function handleWeekChange(dir) {
    setWeekStart((ws) => dir > 0 ? addWeeks(ws, 1) : subWeeks(ws, 1));
  }

  // ── Calendar assignment ───────────────────────────────────────────────────

  async function handleToggleDate(day, isAssigned) {
    if (!activeId) return;
    const ds = toDateStr(day);
    if (isAssigned) {
      const r = await api.delete(`/metrics/schedule/calendar/${ds}`);
      if (r.ok || r.status === 404) {
        setAssignedDates((prev) => { const n = new Set(prev); n.delete(ds); return n; });
      }
    } else {
      const r = await api.put(`/metrics/schedule/calendar/${ds}`, { schedule_id: activeId });
      if (r.ok) {
        setAssignedDates((prev) => new Set([...prev, ds]));
        setCalendarEntries((prev) => {
          const without = prev.filter((e) => e.entry_date !== ds);
          return [...without, { entry_date: ds, schedule_id: activeId, schedule_name: activeSchedule?.name }];
        });
      } else {
        const body = await r.json().catch(() => ({}));
        alert(`Failed to assign schedule: ${body.detail ?? r.status}`);
      }
    }
  }

  // ── Drag end ──────────────────────────────────────────────────────────────

  async function handleDragEnd({ active, over }) {
    setActiveDrag(null);

    // Dragged off the canvas — delete
    if ((!over || !over.id.startsWith('hour:')) && active.id.startsWith('block:')) {
      const blockId = active.id.split(':')[1];
      await handleDelete(blockId);
      return;
    }

    if (!over || !over.id.startsWith('hour:')) return;
    const dropHour = parseFloat(over.id.split(':')[1]);

    if (active.id.startsWith('palette:')) {
      if (!activeId) return;
      const parts     = active.id.split(':');
      const blockType = parts[1];
      const zoneId    = parts[2] || null;
      const label     = parts.slice(3).join(':') || 'Block';
      const r = await api.post(`/metrics/schedule/schedules/${activeId}/blocks`, {
        hour_start: dropHour,
        hour_end:   Math.min(24, dropHour + 1),
        block_type: blockType,
        zone_id:    zoneId || null,
        label,
      });
      if (r.ok) await loadBlocks(activeId);

    } else if (active.id.startsWith('block:')) {
      const blockId = active.id.split(':')[1];
      const block   = blocks.find((b) => b.id === blockId);
      if (!block) return;
      const dur    = (resizeMap[blockId] ?? block.hour_end) - block.hour_start;
      const newEnd = Math.min(24, dropHour + dur);
      await api.put(`/metrics/schedule/blocks/${blockId}`, { hour_start: dropHour, hour_end: newEnd });
      await loadBlocks(activeId);
      setResizeMap((m) => { const c = { ...m }; delete c[blockId]; return c; });
    }
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  async function handleResize(blockId, newEnd) {
    setResizeMap((m) => ({ ...m, [blockId]: newEnd }));
    clearTimeout(window._resizeTimer);
    window._resizeTimer = setTimeout(async () => {
      await api.put(`/metrics/schedule/blocks/${blockId}`, { hour_end: newEnd });
      await loadBlocks(activeId);
    }, 400);
  }

  // ── Delete block ──────────────────────────────────────────────────────────

  async function handleDelete(blockId) {
    await api.delete(`/metrics/schedule/blocks/${blockId}`);
    setBlocks((bs) => bs.filter((b) => b.id !== blockId));
  }

  // ── Edit block metadata ───────────────────────────────────────────────────

  async function handleEditSave(blockId, updates) {
    const r = await api.put(`/metrics/schedule/blocks/${blockId}`, updates);
    if (r.ok) {
      await loadBlocks(activeId);
      setEditingBlock(null);
    }
  }

  // ── Schedule CRUD ─────────────────────────────────────────────────────────

  async function handleNewSchedule(name, description) {
    const r = await api.post('/metrics/schedule/schedules', { name, description });
    if (r.ok) {
      const created = await r.json();
      await loadSchedules();
      setActiveId(created.id);
      setShowNew(false);
    }
  }

  async function handleDeleteSchedule() {
    if (!activeId) return;
    if (!window.confirm(`Delete "${activeSchedule?.name}"? This cannot be undone.`)) return;
    await api.delete(`/metrics/schedule/schedules/${activeId}`);
    const list = await loadSchedules();
    setActiveId(list.length > 0 ? list[0].id : null);
  }

  async function handleChecklistAssign(field, value) {
    if (!activeId) return;
    await api.put(`/metrics/schedule/schedules/${activeId}`, { [field]: value || null });
    await loadSchedules();
  }

  // ── Custom job ────────────────────────────────────────────────────────────

  async function handleCustomJob(label) {
    setCustomJob(false);
    if (!activeId) return;
    const r = await api.post(`/metrics/schedule/schedules/${activeId}/blocks`, {
      hour_start: 8, hour_end: 9, block_type: 'job', label,
    });
    if (r.ok) await loadBlocks(activeId);
  }

  // ── Effective block (live resize) ─────────────────────────────────────────

  function effectiveBlock(b) {
    return resizeMap[b.id] !== undefined ? { ...b, hour_end: resizeMap[b.id] } : b;
  }

  // ── Drag ghost metadata ───────────────────────────────────────────────────

  function getDragMeta(id) {
    if (!id) return null;
    if (id.startsWith('palette:')) {
      const parts = id.split(':');
      return { blockType: parts[1], label: parts.slice(3).join(':') || 'Block' };
    }
    if (id.startsWith('block:')) {
      const block = blocks.find((b) => b.id === id.split(':')[1]);
      return block ? { blockType: block.block_type, label: block.label } : null;
    }
    return null;
  }

  const dragMeta = getDragMeta(activeDrag);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setActiveDrag(active.id)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className="flex flex-col gap-4 h-full" style={{ height: 'calc(100vh - 48px)' }}>

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="page-title">Schedule</h1>
            {activeSchedule?.description && (
              <p className="text-xs text-ink-400 mt-0.5">{activeSchedule.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <SchedulePicker
              schedules={schedules}
              activeId={activeId}
              onChange={setActiveId}
              onNew={() => setShowNew(true)}
            />
            {activeId && (
              <button
                type="button"
                onClick={handleDeleteSchedule}
                title="Delete this schedule"
                className="p-2 rounded-lg text-ink-400 hover:text-error hover:bg-error/10 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
            {activeId && (
              <>
                <div>
                  <p className="section-label mb-0.5">Pre-Day Checklist</p>
                  <select
                    className="arc-input text-xs"
                    value={activeSchedule?.pre_day_checklist_id ?? ''}
                    onChange={(e) => handleChecklistAssign('pre_day_checklist_id', e.target.value)}
                  >
                    <option value="">None</option>
                    {allChecklists.filter((c) => c.checklist_type === 'pre_day').map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="section-label mb-0.5">Post-Day Checklist</p>
                  <select
                    className="arc-input text-xs"
                    value={activeSchedule?.post_day_checklist_id ?? ''}
                    onChange={(e) => handleChecklistAssign('post_day_checklist_id', e.target.value)}
                  >
                    <option value="">None</option>
                    {allChecklists.filter((c) => c.checklist_type === 'post_day').map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Week strip — click day to assign/unassign this schedule */}
        <div className="space-y-1">
          <p className="text-[10px] text-ink-500 px-1">
            {activeSchedule
              ? <>Click a day to assign <span className="text-ink-300">{activeSchedule.name}</span> to it</>
              : 'Select a schedule above to assign it to days'}
          </p>
          <WeekStrip
            weekStart={weekStart}
            onWeekChange={handleWeekChange}
            assignedDates={assignedDates}
            onToggleDate={handleToggleDate}
            disabled={!activeId}
            schedules={schedules}
            calendarEntries={calendarEntries}
            weekLogs={weekLogs}
          />
        </div>

        {/* Body */}
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <p className="text-ink-400 text-sm">No schedule selected</p>
              <button type="button" onClick={() => setShowNew(true)} className="btn-primary gap-1.5">
                <Plus size={14} /> Create a schedule
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 flex-1 min-h-0">

            {/* Palette */}
            <div className="w-48 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">

              {/* Zones grouped by type */}
              <div>
                <p className="section-label mb-2">Zones</p>
                <div className="space-y-3">
                  {ZONE_TYPE_ORDER.map((type) => {
                    const group = zones.filter((z) => z.zone_type === type);
                    if (!group.length) return null;
                    return (
                      <div key={type}>
                        <p className="text-[9px] uppercase tracking-widest text-ink-500 px-1 mb-1">{type}</p>
                        <div className="space-y-1">
                          {group.map((z, i) => (
                            <PaletteItem
                              key={z.id}
                              id={`palette:zone:${z.id}:${z.name}`}
                              label={z.name}
                              blockType="zone"
                              badge={type === 'Anchor' ? i + 1 : undefined}
                              badgeTitle={type === 'Anchor' ? `Anchor ${i + 1}` : undefined}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Job / Contract Work */}
              <div>
                <p className="section-label mb-2">Contract Work</p>
                <div className="space-y-1">
                  {JOB_PRESETS.map((label) => (
                    <PaletteItem
                      key={label}
                      id={`palette:job::${label}`}
                      label={label}
                      blockType="job"
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomJob(true)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-neural/30 text-neural/70 text-xs hover:opacity-100 opacity-60 transition-opacity"
                  >
                    <Plus size={10} /> Custom…
                  </button>
                </div>
              </div>

              {/* Checklists */}
              <div>
                <p className="section-label mb-2">Checklists</p>
                <div className="space-y-1">
                  <PaletteItem id="palette:checklist::Pre-Day Checklist" label="Pre-Day Checklist" blockType="checklist" />
                  <PaletteItem id="palette:checklist::Post-Day Checklist" label="Post-Day Checklist" blockType="checklist" />
                  <PaletteItem id="palette:checklist::Pre-Trip Checklist" label="Pre-Trip Checklist" blockType="checklist" />
                  <PaletteItem id="palette:checklist::Post-Trip Checklist" label="Post-Trip Checklist" blockType="checklist" />
                </div>
              </div>

              {/* Other */}
              <div>
                <p className="section-label mb-2">Other</p>
                <div className="space-y-1">
                  <PaletteItem id="palette:rest::Rest / Break" label="Rest / Break" blockType="rest" />
                  <PaletteItem id="palette:note::Note" label="Note" blockType="note" />
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="flex-1 metal-card overflow-y-auto relative" style={{ scrollbarWidth: 'thin' }}>
              {blocks.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                  <p className="text-ink-500 text-xs">Drag zones and activities onto the timeline</p>
                </div>
              )}
              {(() => {
                const maxHour = Math.max(24, ...blocks.map((b) => Math.ceil(Number(b.hour_end))));
                return (
              <div className="relative" style={{ minHeight: maxHour * HOUR_H }}>
                {Array.from({ length: maxHour * 2 }, (_, i) => (
                  <TimelineDropZone key={i * 0.5} hour={i * 0.5} />
                ))}
                {blocks.map((b) => {
                  const eb = effectiveBlock(b);
                  let anchorRank = null;
                  if (eb.block_type === 'zone' && eb.zone_id) {
                    const anchors = zones.filter((z) => z.zone_type === 'Anchor');
                    const idx = anchors.findIndex((z) => z.id === eb.zone_id);
                    if (idx !== -1) anchorRank = idx + 1;
                  }
                  return (
                    <TimelineBlock
                      key={eb.id}
                      block={eb}
                      anchorRank={anchorRank}
                      onDelete={handleDelete}
                      onResize={handleResize}
                      onEdit={setEditingBlock}
                    />
                  );
                })}
              </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {dragMeta && <DragGhost label={dragMeta.label} blockType={dragMeta.blockType} />}
      </DragOverlay>

      {/* Modals */}
      {showNew      && <NewScheduleModal onSave={handleNewSchedule} onClose={() => setShowNew(false)} />}
      {customJob    && <CustomJobModal onAdd={handleCustomJob} onClose={() => setCustomJob(false)} />}
      {editingBlock && (
        <BlockEditModal
          block={editingBlock}
          zones={zones}
          platforms={platforms}
          onSave={handleEditSave}
          onClose={() => setEditingBlock(null)}
        />
      )}
    </DndContext>
  );
}
