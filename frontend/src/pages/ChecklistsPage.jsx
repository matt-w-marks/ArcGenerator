import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, AlertCircle, Pencil, Check, X, ClipboardCheck, Camera, History as HistoryIcon, Image as ImageIcon } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/utils';

const TYPES = [
  { value: 'pre_day', label: 'Pre-Day' },
  { value: 'post_day', label: 'Post-Day' },
  { value: 'pre_trip', label: 'Pre-Trip' },
  { value: 'post_trip', label: 'Post-Trip' },
];

export default function ChecklistsPage() {
  const [tab, setTab] = useState('templates');
  const [checklists, setChecklists] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', checklist_type: 'pre_day', description: '', allow_photos: false });
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newItemText, setNewItemText] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await api.get('/metrics/maintenance/checklists');
    if (r.ok) setChecklists(await r.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    const r = await api.post('/metrics/maintenance/checklists', {
      name: addForm.name, checklist_type: addForm.checklist_type, description: addForm.description || null,
      allow_photos: addForm.allow_photos,
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setAddForm({ name: '', checklist_type: 'pre_day', description: '', allow_photos: false });
    setShowAdd(false);
    load();
  }

  async function handleSaveEdit(id) {
    await api.put(`/metrics/maintenance/checklists/${id}`, {
      name: editForm.name, checklist_type: editForm.checklist_type, description: editForm.description || null,
      allow_photos: editForm.allow_photos,
    });
    setEditing(null);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this checklist and all its items?')) return;
    await api.delete(`/metrics/maintenance/checklists/${id}`);
    load();
  }

  async function handleAddItem(checklistId) {
    const text = (newItemText[checklistId] || '').trim();
    if (!text) return;
    const r = await api.post(`/metrics/maintenance/checklists/${checklistId}/items`, { label: text, sort_order: 0 });
    if (r.ok) { setNewItemText({ ...newItemText, [checklistId]: '' }); load(); }
  }

  async function handleDeleteItem(itemId) {
    await api.delete(`/metrics/maintenance/checklist-items/${itemId}`);
    load();
  }

  const typeLabel = (t) => TYPES.find((x) => x.value === t)?.label || t;

  return (
    <div className="max-w-3xl xl:max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Checklists</h1>
          <p className="text-xs text-ink-400 mt-0.5">Templates and completion history</p>
        </div>
        {tab === 'templates' && (
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs gap-1.5"><Plus size={12} /> Add Checklist</button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-obsidian-700">
        {[['templates', 'Templates', ClipboardCheck], ['history', 'History', HistoryIcon]].map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === id ? 'border-arc text-arc' : 'border-transparent text-ink-400 hover:text-ink-200'
            }`}>
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      {tab === 'history' && <HistoryView checklists={checklists} />}

      {tab === 'templates' && <>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {showAdd && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">New Checklist</h3>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Name *</label>
                <input type="text" required maxLength={64} className="arc-input text-sm font-light"
                  placeholder="Morning Vehicle Check" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Type</label>
                <select className="arc-input text-sm font-light" value={addForm.checklist_type}
                  onChange={(e) => setAddForm({ ...addForm, checklist_type: e.target.value })}>
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Description</label>
                <input type="text" maxLength={256} className="arc-input text-sm font-light"
                  placeholder="Optional" value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="add-allow-photos" className="accent-arc"
                  checked={addForm.allow_photos} onChange={(e) => setAddForm({ ...addForm, allow_photos: e.target.checked })} />
                <label htmlFor="add-allow-photos" className="text-xs text-ink-300">Allow photo evidence (for incident/legal documentation)</label>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs">Create</button>
            </div>
          </form>
        </div>
      )}

      {checklists.length === 0 && !showAdd && (
        <div className="metal-card px-6 py-8 text-center">
          <ClipboardCheck size={24} className="text-ink-500 mx-auto mb-2" />
          <p className="text-ink-400 text-sm">No checklists configured.</p>
          <p className="text-ink-500 text-xs mt-1">Create checklists to use in your daily schedule.</p>
        </div>
      )}

      {checklists.map((cl) => {
        const isEditing = editing === cl.id;
        return (
          <div key={cl.id} className="metal-card p-4">
            <div className="flex items-start justify-between mb-3">
              {isEditing ? (
                <div className="flex-1 space-y-2">
                  <input type="text" className="arc-input text-sm font-light w-full"
                    value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  <select className="arc-input text-xs font-light" value={editForm.checklist_type}
                    onChange={(e) => setEditForm({ ...editForm, checklist_type: e.target.value })}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-xs text-ink-300">
                    <input type="checkbox" className="accent-arc"
                      checked={!!editForm.allow_photos} onChange={(e) => setEditForm({ ...editForm, allow_photos: e.target.checked })} />
                    Allow photo evidence
                  </label>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={14} className="text-arc" />
                  <h3 className="text-sm font-semibold text-ink-100">{cl.name}</h3>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-arc/10 text-arc border border-arc/20 uppercase">{typeLabel(cl.checklist_type)}</span>
                  {cl.allow_photos && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-ember/10 text-ember border border-ember/20 inline-flex items-center gap-0.5">
                      <Camera size={8} /> PHOTOS
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <>
                    <button onClick={() => handleSaveEdit(cl.id)} className="text-arc hover:text-ink-50 p-0.5"><Check size={12} /></button>
                    <button onClick={() => setEditing(null)} className="text-ink-400 hover:text-ink-50 p-0.5"><X size={12} /></button>
                  </>
                ) : (
                  <button onClick={() => { setEditing(cl.id); setEditForm({ name: cl.name, checklist_type: cl.checklist_type, description: cl.description || '', allow_photos: cl.allow_photos }); }} className="text-ink-400 hover:text-ink-50 p-0.5">
                    <Pencil size={12} />
                  </button>
                )}
                <button onClick={() => handleDelete(cl.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors"><Trash2 size={12} /></button>
              </div>
            </div>

            <div className="space-y-1">
              {(cl.items || []).filter((i) => i.active !== false).map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-xs group">
                  <span className="text-ink-500">·</span>
                  <span className="flex-1 text-ink-300">{item.label}</span>
                  <button onClick={() => handleDeleteItem(item.id)} className="text-ink-500 hover:text-error opacity-0 group-hover:opacity-100 p-0.5 transition-all">
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-3">
              <input type="text" placeholder="Add item..." className="arc-input text-xs font-light py-1 flex-1"
                value={newItemText[cl.id] || ''} onChange={(e) => setNewItemText({ ...newItemText, [cl.id]: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(cl.id); }} />
              <button onClick={() => handleAddItem(cl.id)} className="btn-ghost text-xs gap-1"><Plus size={10} /></button>
            </div>
          </div>
        );
      })}
      </>}
    </div>
  );
}

// ── History view ────────────────────────────────────────────────────────────
function HistoryView({ checklists }) {
  const [logs, setLogs] = useState([]);
  const [filterId, setFilterId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [hasPhotos, setHasPhotos] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterId) params.set('checklist_id', filterId);
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);
    if (hasPhotos === 'yes') params.set('has_photos', 'true');
    if (hasPhotos === 'no') params.set('has_photos', 'false');
    const r = await api.get(`/metrics/maintenance/checklist-logs/history?${params.toString()}`);
    if (r.ok) setLogs(await r.json());
  }, [filterId, fromDate, toDate, hasPhotos]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="metal-card p-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Checklist</label>
            <select className="arc-input text-xs font-light py-1" value={filterId} onChange={(e) => setFilterId(e.target.value)}>
              <option value="">All</option>
              {checklists.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">From</label>
            <input type="date" className="arc-input text-xs font-light py-1" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">To</label>
            <input type="date" className="arc-input text-xs font-light py-1" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Photos</label>
            <select className="arc-input text-xs font-light py-1" value={hasPhotos} onChange={(e) => setHasPhotos(e.target.value)}>
              <option value="">Any</option>
              <option value="yes">With photos</option>
              <option value="no">Without photos</option>
            </select>
          </div>
        </div>
      </div>

      {logs.length === 0 && (
        <div className="metal-card px-6 py-8 text-center">
          <p className="text-ink-400 text-sm">No completed checklists found.</p>
        </div>
      )}

      {logs.length > 0 && (
        <div className="metal-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Date</th>
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Checklist</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Items</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Photos</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} onClick={() => setSelectedLog(log)}
                  className="border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-xs font-mono text-ink-400">{formatDate(log.log_date)}</td>
                  <td className="px-4 py-3">
                    <p className="text-ink-100">{log.checklist_name || '—'}</p>
                    {log.checklist_type && <p className="text-[9px] text-ink-500 uppercase">{log.checklist_type.replace('_', ' ')}</p>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-mono text-ink-300">{log.checked_count}</td>
                  <td className="px-4 py-3 text-right">
                    {log.photo_count > 0 ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-ember/15 text-ember border border-ember/30 inline-flex items-center gap-0.5">
                        <Camera size={8} /> {log.photo_count}
                      </span>
                    ) : <span className="text-[9px] text-ink-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[10px] text-ink-500">click to view</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedLog && <LogDetailModal log={selectedLog} onClose={() => { setSelectedLog(null); load(); }} />}
    </div>
  );
}

// ── Log detail modal with photos ────────────────────────────────────────────
function LogDetailModal({ log, onClose }) {
  const [photos, setPhotos] = useState([]);
  const loadPhotos = useCallback(async () => {
    const r = await api.get(`/metrics/maintenance/checklist-logs/${log.id}/photos`);
    if (r.ok) setPhotos(await r.json());
  }, [log.id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  async function handleDeletePhoto(photoId) {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    await api.delete(`/metrics/maintenance/checklist-log-photos/${photoId}`);
    loadPhotos();
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    await fetch(`/metrics/maintenance/checklist-logs/${log.id}/photos`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('rm_at')}` },
      body: fd,
    });
    loadPhotos();
    e.target.value = '';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="metal-card p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-100">{log.checklist_name || 'Checklist'}</h3>
            <p className="text-xs text-ink-500 mt-0.5">{formatDate(log.log_date)} · {log.checked_count} items checked</p>
            {log.notes && <p className="text-xs text-ink-300 mt-2">{log.notes}</p>}
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-50 p-1"><X size={16} /></button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-ink-50 font-bold uppercase tracking-wide">Photos ({photos.length})</p>
            <label className="btn-ghost text-xs gap-1.5 cursor-pointer">
              <Camera size={12} /> Upload
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleUpload} />
            </label>
          </div>
          {photos.length === 0 && (
            <p className="text-xs text-ink-500 text-center py-4">No photos attached.</p>
          )}
          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photos.map((p) => (
                <div key={p.id} className="relative group">
                  <a href={`/metrics/maintenance/checklist-log-photos/${p.id}`} target="_blank" rel="noreferrer">
                    <img src={`/metrics/maintenance/checklist-log-photos/${p.id}`} alt={p.caption || ''}
                      className="w-full h-32 object-cover rounded-lg border border-obsidian-600" />
                  </a>
                  <button onClick={() => handleDeletePhoto(p.id)}
                    className="absolute top-1 right-1 p-1 rounded bg-error/80 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={10} />
                  </button>
                  <p className="text-[9px] text-ink-500 mt-0.5 truncate">{formatDate(p.uploaded_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
