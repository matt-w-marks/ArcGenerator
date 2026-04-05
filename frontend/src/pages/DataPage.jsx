import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../lib/api';

const CATEGORIES = ['rides', 'food', 'other'];

const CATEGORY_LABELS = { rides: 'Rides', food: 'Food Delivery', other: 'Other' };

const DEFAULT_COLORS = {
  rides: '#6366f1',
  food:  '#f59e0b',
  other: '#6b7280',
};

// ── Inline row editor ─────────────────────────────────────────────────────────

function PlatformRow({ platform, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name,     setName]     = useState(platform.name);
  const [category, setCategory] = useState(platform.category);
  const [color,    setColor]    = useState(platform.color ?? '#6366f1');
  const [active,   setActive]   = useState(platform.active);

  async function handleSave() {
    await onSave(platform.id, { name, category, color, active });
    setEditing(false);
  }

  function handleCancel() {
    setName(platform.name);
    setCategory(platform.category);
    setColor(platform.color ?? '#6366f1');
    setActive(platform.active);
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className="bg-obsidian-800/60">
        <td className="px-4 py-2">
          <input
            type="text"
            className="arc-input text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
          />
        </td>
        <td className="px-4 py-2">
          <select
            className="arc-input text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="w-8 h-8 rounded cursor-pointer border border-obsidian-600 bg-transparent"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <span className="text-[11px] text-ink-400 font-mono">{color}</span>
          </div>
        </td>
        <td className="px-4 py-2">
          <button
            type="button"
            onClick={() => setActive((a) => !a)}
            className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
              active ? 'bg-success/15 text-success' : 'bg-obsidian-700 text-ink-400'
            }`}
          >
            {active ? 'Active' : 'Inactive'}
          </button>
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-2">
            <button type="button" onClick={handleSave} className="btn-primary text-xs gap-1 py-1">
              <Check size={11} /> Save
            </button>
            <button type="button" onClick={handleCancel} className="btn-ghost text-xs py-1">
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-obsidian-700/50 hover:bg-obsidian-800/30 transition-colors group">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: platform.color ?? '#6b7280' }}
          />
          <span className={`text-sm font-medium ${platform.active ? 'text-ink-100' : 'text-ink-500 line-through'}`}>
            {platform.name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-ink-400">{CATEGORY_LABELS[platform.category] ?? platform.category}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-ink-500 font-mono">{platform.color ?? '—'}</span>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          platform.active ? 'bg-success/10 text-success' : 'bg-obsidian-700 text-ink-500'
        }`}>
          {platform.active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-ink-400 hover:text-ink-50 transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(platform.id)}
            className="text-ink-400 hover:text-error transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Add platform row ──────────────────────────────────────────────────────────

function AddPlatformRow({ onAdd }) {
  const [open,     setOpen]     = useState(false);
  const [name,     setName]     = useState('');
  const [category, setCategory] = useState('rides');
  const [color,    setColor]    = useState('#6366f1');

  async function handleAdd() {
    if (!name.trim()) return;
    await onAdd({ name: name.trim(), category, color });
    setName('');
    setCategory('rides');
    setColor(DEFAULT_COLORS.rides);
    setOpen(false);
  }

  if (!open) {
    return (
      <tr>
        <td colSpan={5} className="px-4 py-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-50 transition-colors"
          >
            <Plus size={12} /> Add platform
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-arc/5 border border-arc/20">
      <td className="px-4 py-2">
        <input
          autoFocus
          type="text"
          className="arc-input text-sm"
          placeholder="Platform name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setOpen(false); }}
          maxLength={64}
        />
      </td>
      <td className="px-4 py-2">
        <select
          className="arc-input text-sm"
          value={category}
          onChange={(e) => { setCategory(e.target.value); setColor(DEFAULT_COLORS[e.target.value] ?? '#6366f1'); }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="w-8 h-8 rounded cursor-pointer border border-obsidian-600 bg-transparent"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <span className="text-[11px] text-ink-400 font-mono">{color}</span>
        </div>
      </td>
      <td className="px-4 py-2">
        <span className="text-xs text-ink-400">Active</span>
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button type="button" onClick={handleAdd} disabled={!name.trim()} className="btn-primary text-xs gap-1 py-1">
            <Plus size={11} /> Add
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs py-1">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Checklist constants ────────────────────────────────────────────────────────

const CHECKLIST_TYPES = ['pre_day', 'post_day', 'pre_trip', 'post_trip'];

const CHECKLIST_TYPE_LABELS = {
  pre_day:   'Pre-Day',
  post_day:  'Post-Day',
  pre_trip:  'Pre-Trip',
  post_trip: 'Post-Trip',
};

// ── Checklist item row ────────────────────────────────────────────────────────

function ChecklistItemRow({ item, onEdit, onDelete }) {
  const [editing,   setEditing]   = useState(false);
  const [label,     setLabel]     = useState(item.label);
  const [sortOrder, setSortOrder] = useState(item.sort_order);
  const [active,    setActive]    = useState(item.active);

  async function handleSave() {
    if (!label.trim()) return;
    await onEdit(item.id, { label: label.trim(), sort_order: sortOrder, active });
    setEditing(false);
  }

  function handleCancel() {
    setLabel(item.label);
    setSortOrder(item.sort_order);
    setActive(item.active);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2 rounded-lg bg-obsidian-800/60 border border-obsidian-600/50">
        <input
          autoFocus
          type="text"
          className="arc-input text-sm"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
          maxLength={128}
          placeholder="Item label"
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-400">
            Order
            <input
              type="number"
              className="arc-input text-xs w-16"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              min={0}
            />
          </label>
          <button
            type="button"
            onClick={() => setActive((a) => !a)}
            className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
              active ? 'bg-success/15 text-success' : 'bg-obsidian-700 text-ink-400'
            }`}
          >
            {active ? 'Active' : 'Inactive'}
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={handleSave} className="btn-primary text-xs gap-1 py-1">
              <Check size={11} /> Save
            </button>
            <button type="button" onClick={handleCancel} className="btn-ghost text-xs py-1">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${item.active ? 'bg-obsidian-900' : 'bg-obsidian-900/40'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] text-ink-600 font-mono w-4 shrink-0">{item.sort_order}</span>
        <span className={`text-sm truncate ${item.active ? 'text-ink-200' : 'text-ink-500 line-through'}`}>{item.label}</span>
        {!item.active && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-obsidian-700 text-ink-500 shrink-0">inactive</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => { setLabel(item.label); setSortOrder(item.sort_order); setActive(item.active); setEditing(true); }}
          className="text-ink-400 hover:text-ink-50 transition-colors p-0.5"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="text-ink-400 hover:text-error transition-colors p-0.5"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Checklist row ─────────────────────────────────────────────────────────────

function ChecklistRow({ checklist, expanded, onToggle, onRename, onDelete, onAddItem, onEditItem, onDeleteItem }) {
  const [editing,  setEditing]  = useState(false);
  const [name,     setName]     = useState(checklist.name);
  const [newLabel, setNewLabel] = useState('');

  async function handleRename() {
    if (!name.trim() || name.trim() === checklist.name) { setEditing(false); return; }
    await onRename(checklist.id, name.trim());
    setEditing(false);
  }

  async function handleAddItem(e) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    const sortOrder = checklist.items?.length ?? 0;
    await onAddItem(checklist.id, newLabel.trim(), sortOrder);
    setNewLabel('');
  }

  return (
    <div className="border border-obsidian-700/50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-obsidian-800/40 group">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
        >
          {expanded ? <ChevronUp size={13} className="text-ink-400 shrink-0" /> : <ChevronDown size={13} className="text-ink-400 shrink-0" />}
          <span className="text-sm text-ink-100 font-medium truncate">{checklist.name}</span>
          <span className="text-xs text-ink-500 shrink-0">{checklist.items?.length ?? 0} items</span>
        </button>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-obsidian-700 text-ink-400 shrink-0">
          {CHECKLIST_TYPE_LABELS[checklist.checklist_type] ?? checklist.checklist_type}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={() => { setName(checklist.name); setEditing(true); }}
            className="text-ink-400 hover:text-ink-50 transition-colors p-0.5"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(checklist.id)}
            className="text-ink-400 hover:text-error transition-colors p-0.5"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {editing && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-obsidian-700/50 bg-obsidian-800/60">
          <input
            autoFocus
            type="text"
            className="arc-input text-sm flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false); }}
            maxLength={128}
          />
          <button type="button" onClick={handleRename} className="btn-primary text-xs gap-1 py-1">
            <Check size={11} /> Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost text-xs py-1">
            Cancel
          </button>
        </div>
      )}

      {expanded && (
        <div className="px-3 py-2 border-t border-obsidian-700/50 space-y-1">
          {(checklist.items ?? []).length === 0 && (
            <p className="text-xs text-ink-500 py-1">No items yet.</p>
          )}
          {[...(checklist.items ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((item) => (
            <ChecklistItemRow key={item.id} item={item} onEdit={onEditItem} onDelete={onDeleteItem} />
          ))}
          <form onSubmit={handleAddItem} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              className="arc-input text-xs flex-1"
              placeholder="Add item…"
              maxLength={128}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <button type="submit" disabled={!newLabel.trim()} className="btn-ghost text-xs py-1.5 gap-1">
              <Plus size={11} /> Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── New checklist inline form ─────────────────────────────────────────────────

function NewChecklistForm({ checklistType, onAdd, onCancel }) {
  const [name, setName] = useState('');

  async function handleAdd() {
    if (!name.trim()) return;
    await onAdd({ name: name.trim(), checklist_type: checklistType });
    setName('');
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-arc/20 bg-arc/5">
      <input
        autoFocus
        type="text"
        className="arc-input text-sm flex-1"
        placeholder="Checklist name…"
        maxLength={128}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onCancel(); }}
      />
      <button type="button" onClick={handleAdd} disabled={!name.trim()} className="btn-primary text-xs gap-1 py-1">
        <Plus size={11} /> Add
      </button>
      <button type="button" onClick={onCancel} className="btn-ghost text-xs py-1">
        Cancel
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DataPage() {
  const [platforms,       setPlatforms]       = useState([]);
  const [showInactive,    setShowInactive]    = useState(false);
  const [checklists,      setChecklists]      = useState([]);
  const [expandedChecklist, setExpandedChecklist] = useState(null);
  const [newChecklistFor, setNewChecklistFor] = useState(null);

  const loadPlatforms = async (includeInactive = showInactive) => {
    const r = await api.get(`/metrics/platforms?include_inactive=${includeInactive}`);
    if (r.ok) setPlatforms(await r.json());
  };

  const loadChecklists = async () => {
    const r = await api.get('/metrics/maintenance/checklists');
    if (r.ok) setChecklists(await r.json());
  };

  useEffect(() => { loadPlatforms(); loadChecklists(); }, []);

  async function handleAdd(data) {
    const r = await api.post('/metrics/platforms', data);
    if (r.ok) loadPlatforms();
  }

  async function handleSave(id, data) {
    const r = await api.put(`/metrics/platforms/${id}`, data);
    if (r.ok) loadPlatforms();
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this platform? This will clear it from any schedule blocks.')) return;
    await api.delete(`/metrics/platforms/${id}`);
    loadPlatforms();
  }

  function toggleInactive() {
    const next = !showInactive;
    setShowInactive(next);
    loadPlatforms(next);
  }

  async function handleAddChecklist(data) {
    const r = await api.post('/metrics/maintenance/checklists', data);
    if (r.ok) { setNewChecklistFor(null); loadChecklists(); }
  }

  async function handleRenameChecklist(id, name) {
    const r = await api.put(`/metrics/maintenance/checklists/${id}`, { name });
    if (r.ok) loadChecklists();
  }

  async function handleDeleteChecklist(id) {
    if (!window.confirm('Delete this checklist and all its items?')) return;
    await api.delete(`/metrics/maintenance/checklists/${id}`);
    if (expandedChecklist === id) setExpandedChecklist(null);
    loadChecklists();
  }

  async function handleAddChecklistItem(checklistId, label, sortOrder) {
    const r = await api.post(`/metrics/maintenance/checklists/${checklistId}/items`, { label, sort_order: sortOrder });
    if (r.ok) loadChecklists();
  }

  async function handleEditChecklistItem(itemId, data) {
    const r = await api.put(`/metrics/maintenance/checklist-items/${itemId}`, data);
    if (r.ok) loadChecklists();
  }

  async function handleDeleteChecklistItem(itemId) {
    await api.delete(`/metrics/maintenance/checklist-items/${itemId}`);
    loadChecklists();
  }

  const byCategory = CATEGORIES.reduce((acc, cat) => {
    const group = platforms.filter((p) => p.category === cat);
    if (group.length) acc[cat] = group;
    return acc;
  }, {});

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Data</h1>
          <p className="text-xs text-ink-400 mt-0.5">Manage reference datasets used across the app</p>
        </div>
        <button
          type="button"
          onClick={toggleInactive}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            showInactive
              ? 'border-arc/40 text-arc bg-arc/10'
              : 'border-obsidian-600 text-ink-400 hover:text-ink-50'
          }`}
        >
          {showInactive ? 'Hiding inactive' : 'Show inactive'}
        </button>
      </div>

      {/* Platforms */}
      <div className="metal-card overflow-hidden">
        <div className="px-4 py-3 border-b border-obsidian-700">
          <h2 className="text-sm font-semibold text-ink-100">Platforms</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            Revenue platforms you operate on. Used to tag schedule blocks and driving sessions.
          </p>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-obsidian-700/50">
              <th className="px-4 py-2 text-left section-label">Platform</th>
              <th className="px-4 py-2 text-left section-label">Category</th>
              <th className="px-4 py-2 text-left section-label">Color</th>
              <th className="px-4 py-2 text-left section-label">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {platforms.map((p) => (
              <PlatformRow
                key={p.id}
                platform={p}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
            <AddPlatformRow onAdd={handleAdd} />
          </tbody>
        </table>
      </div>

      {/* Checklists */}
      <div className="metal-card overflow-hidden">
        <div className="px-4 py-3 border-b border-obsidian-700">
          <h2 className="text-sm font-semibold text-ink-100">Checklists</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            Named checklists for pre/post day and trip routines.
          </p>
        </div>

        <div className="px-4 py-4 space-y-6">
          {CHECKLIST_TYPES.map((type) => {
            const group = checklists.filter((c) => c.checklist_type === type);
            return (
              <div key={type}>
                <div className="flex items-center justify-between mb-2">
                  <span className="section-label">{CHECKLIST_TYPE_LABELS[type]}</span>
                  <button
                    type="button"
                    onClick={() => setNewChecklistFor(newChecklistFor === type ? null : type)}
                    className="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-50 transition-colors"
                  >
                    <Plus size={12} /> New checklist
                  </button>
                </div>

                <div className="space-y-2">
                  {group.length === 0 && newChecklistFor !== type && (
                    <p className="text-xs text-ink-500 px-1">No checklists yet.</p>
                  )}
                  {group.map((cl) => (
                    <ChecklistRow
                      key={cl.id}
                      checklist={cl}
                      expanded={expandedChecklist === cl.id}
                      onToggle={() => setExpandedChecklist(expandedChecklist === cl.id ? null : cl.id)}
                      onRename={handleRenameChecklist}
                      onDelete={handleDeleteChecklist}
                      onAddItem={handleAddChecklistItem}
                      onEditItem={handleEditChecklistItem}
                      onDeleteItem={handleDeleteChecklistItem}
                    />
                  ))}
                  {newChecklistFor === type && (
                    <NewChecklistForm
                      checklistType={type}
                      onAdd={handleAddChecklist}
                      onCancel={() => setNewChecklistFor(null)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Financial Config */}
      <FinancialConfigCard />

      {/* Audit History */}
      <AuditHistoryCard />
    </div>
  );
}

// ── Financial config card ─────────────────────────────────────────────────────

const PHASES = [
  { value: 'PHASE_1', label: 'Phase 1 — Rental' },
  { value: 'PHASE_2', label: 'Phase 2 — Owned Vehicle' },
  { value: 'PHASE_3', label: 'Phase 3 — Contracting' },
];

function FinancialConfigCard() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/metrics/reports/config').then(async (r) => {
      if (r.ok) {
        const c = await r.json();
        setConfig(c);
        setForm(c);
      }
    });
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    const r = await api.put('/metrics/reports/config', form);
    if (r.ok) {
      const c = await r.json();
      setConfig(c);
      setForm(c);
      setDirty(false);
    }
    setSaving(false);
  }

  if (!config) return null;

  return (
    <div className="metal-card overflow-hidden">
      <div className="px-4 py-3 border-b border-obsidian-700">
        <h2 className="text-sm font-semibold text-ink-100">Financial Config</h2>
        <p className="text-xs text-ink-500 mt-0.5">
          Phase, vehicle cost, monthly nut, bankroll, and tax rates. These drive all report calculations.
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Phase</label>
            <select className="arc-input text-sm font-light" value={form.phase} onChange={(e) => update('phase', e.target.value)}>
              {PHASES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Weekly Vehicle Cost</label>
            <input type="number" step="0.01" min="0" className="arc-input text-sm font-light font-mono"
              value={form.weekly_vehicle_cost} onChange={(e) => update('weekly_vehicle_cost', Number(e.target.value))} />
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Monthly Nut</label>
            <input type="number" step="0.01" min="0" className="arc-input text-sm font-light font-mono"
              value={form.monthly_nut} onChange={(e) => update('monthly_nut', Number(e.target.value))} />
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Bankroll Remaining</label>
            <input type="number" step="0.01" min="0" className="arc-input text-sm font-light font-mono"
              value={form.bankroll_remaining} onChange={(e) => update('bankroll_remaining', Number(e.target.value))} />
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">SE Tax Rate</label>
            <input type="number" step="0.0001" min="0" max="1" className="arc-input text-sm font-light font-mono"
              value={form.se_tax_rate} onChange={(e) => update('se_tax_rate', Number(e.target.value))} />
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">IRS Mileage Rate</label>
            <input type="number" step="0.0001" min="0" max="2" className="arc-input text-sm font-light font-mono"
              value={form.irs_mileage_rate} onChange={(e) => update('irs_mileage_rate', Number(e.target.value))} />
          </div>
        </div>

        {dirty && (
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary text-xs gap-1.5 w-full">
            {saving ? 'Saving…' : 'Save Config'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Audit history card ────────────────────────────────────────────────────────

const TABLE_LABELS = {
  system_config: 'Config',
  daily_block_logs: 'Shift Log',
  daily_expenses: 'Expense',
  daily_platform_earnings: 'Platform Earning',
};

const ACTION_STYLES = {
  CREATE: 'bg-success/15 text-success',
  UPDATE: 'bg-arc/15 text-arc',
  DELETE: 'bg-error/15 text-error',
  RESTORE: 'bg-neural/15 text-neural',
};

function AuditHistoryCard() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  async function load(table) {
    setLoading(true);
    const q = table ? `?table=${table}&limit=50` : '?limit=50';
    const r = await api.get(`/metrics/audit-logs${q}`);
    if (r.ok) setLogs(await r.json());
    setLoading(false);
  }

  useEffect(() => { load(filter); }, [filter]);

  return (
    <div className="metal-card overflow-hidden">
      <div className="px-4 py-3 border-b border-obsidian-700">
        <h2 className="text-sm font-semibold text-ink-100">Audit History</h2>
        <p className="text-xs text-ink-500 mt-0.5">
          Every change to shift logs, expenses, platform earnings, and config is recorded here.
        </p>
      </div>

      <div className="px-4 py-3 border-b border-obsidian-700/50 flex items-center gap-2">
        <select className="arc-input text-xs font-light py-1 w-40" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All tables</option>
          <option value="system_config">Config</option>
          <option value="daily_block_logs">Shift Logs</option>
          <option value="daily_expenses">Expenses</option>
          <option value="daily_platform_earnings">Platform Earnings</option>
        </select>
        {loading && <span className="text-[10px] text-ink-500">Loading…</span>}
      </div>

      <div className="max-h-96 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {logs.length === 0 && (
          <p className="text-xs text-ink-500 px-4 py-6 text-center">No audit entries yet.</p>
        )}
        {logs.map((entry) => (
          <div key={entry.id} className="border-b border-obsidian-700/30">
            <button
              type="button"
              onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-obsidian-800/30 transition-colors"
            >
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${ACTION_STYLES[entry.action] || 'bg-obsidian-700 text-ink-400'}`}>
                {entry.action}
              </span>
              <span className="text-[10px] text-ink-300 font-bold">
                {TABLE_LABELS[entry.table_name] || entry.table_name}
              </span>
              <span className="text-[10px] text-ink-600 font-mono truncate flex-1">
                {entry.record_id.slice(0, 8)}
              </span>
              <span className="text-[10px] text-ink-500 font-mono shrink-0">
                {new Date(entry.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </button>
            {expanded === entry.id && (
              <div className="px-4 pb-3 space-y-1.5">
                {entry.user_id && (
                  <p className="text-[9px] text-ink-500">User: <span className="font-mono">{entry.user_id.slice(0, 8)}…</span></p>
                )}
                {Object.entries(entry.changes).map(([field, val]) => (
                  <div key={field} className="flex items-start gap-2 text-[10px]">
                    <span className="text-ink-50 font-bold uppercase shrink-0 w-28 truncate">{field}</span>
                    {typeof val === 'object' && val !== null && 'old' in val ? (
                      <span className="font-light font-mono text-ink-300">
                        <span className="text-error">{JSON.stringify(val.old)}</span>
                        {' → '}
                        <span className="text-success">{JSON.stringify(val.new)}</span>
                      </span>
                    ) : (
                      <span className="font-light font-mono text-ink-300">{JSON.stringify(val)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
