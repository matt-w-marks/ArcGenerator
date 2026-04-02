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
    </div>
  );
}
