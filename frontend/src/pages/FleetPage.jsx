import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, AlertCircle, ChevronDown, ChevronUp, Car, Wrench, ClipboardCheck, Check } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, formatDate, round1 } from '../lib/utils';

const OWNERSHIP_LABELS = { rental: 'Rental', owned: 'Owned', leased: 'Leased' };
const STATUS_STYLES = { active: 'bg-success/15 text-success border-success/30', retired: 'bg-obsidian-700 text-ink-500' };
const SERVICE_TYPES = ['Oil Change', 'Tire Rotation', 'Tire Replacement', 'Brake Service', 'Battery', 'Alignment', 'Transmission', 'A/C Service', 'Inspection', 'Other'];

function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }

// ── Maintenance tab ──────────────────────────────────────────────────────────
function MaintenanceTab() {
  const [records, setRecords] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ service_date: todayStr(), shop_name: '', service_type: '', description: '', mileage: '', cost: '', next_due_miles: '', next_due_date: '', notes: '' });
  const [error, setError] = useState('');

  async function load() {
    const r = await api.get('/metrics/maintenance/records');
    if (r.ok) setRecords(await r.json());
  }
  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    const body = {
      service_date: form.service_date, shop_name: form.shop_name, service_type: form.service_type,
      description: form.description || null, mileage: form.mileage ? Number(form.mileage) : null,
      cost: form.cost ? Number(form.cost) : null, next_due_miles: form.next_due_miles ? Number(form.next_due_miles) : null,
      next_due_date: form.next_due_date || null, notes: form.notes || null,
    };
    const r = await api.post('/metrics/maintenance/records', body);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setForm({ service_date: todayStr(), shop_name: '', service_type: '', description: '', mileage: '', cost: '', next_due_miles: '', next_due_date: '', notes: '' });
    setShowForm(false); load();
  }

  async function handleDelete(id) {
    await api.delete(`/metrics/maintenance/records/${id}`);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-500">{records.length} service records</p>
        <button onClick={() => setShowForm(true)} className="btn-primary text-xs gap-1.5"><Plus size={12} /> Add Record</button>
      </div>
      {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs"><AlertCircle size={12} /> {error}</div>}
      {showForm && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">New Service Record</h3>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Date *</label>
                <input type="date" required className="arc-input text-sm font-light" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Shop *</label>
                <input type="text" required maxLength={128} className="arc-input text-sm font-light" placeholder="Jiffy Lube" value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Service *</label>
                <select required className="arc-input text-sm font-light" value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })}>
                  <option value="">Select...</option>
                  {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Odometer</label>
                <input type="number" className="arc-input text-sm font-light font-mono" placeholder="Miles" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Cost</label>
                <input type="number" step="0.01" min="0" className="arc-input text-sm font-light font-mono" placeholder="$0.00" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Description</label>
                <input type="text" maxLength={256} className="arc-input text-sm font-light" placeholder="Synthetic 5W-30" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Next Due Miles</label>
                <input type="number" className="arc-input text-sm font-light font-mono" value={form.next_due_miles} onChange={(e) => setForm({ ...form, next_due_miles: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Next Due Date</label>
                <input type="date" className="arc-input text-sm font-light" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs">Add</button>
            </div>
          </form>
        </div>
      )}
      {records.length > 0 && (
        <div className="metal-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-obsidian-600">
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Date</th>
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Service</th>
                <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Shop</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Cost</th>
                <th className="text-right text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Miles</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-ink-400">{formatDate(r.service_date)}</td>
                  <td className="px-4 py-3">
                    <p className="text-ink-100">{r.service_type}</p>
                    {r.description && <p className="text-[9px] text-ink-500">{r.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-300">{r.shop_name}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-300">{r.cost ? formatCurrency(r.cost) : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-400">{r.mileage ? r.mileage.toLocaleString() : '—'}</td>
                  <td className="px-2 py-3">
                    <button onClick={() => handleDelete(r.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {records.length === 0 && !showForm && (
        <div className="metal-card px-6 py-8 text-center">
          <p className="text-ink-400 text-sm">No maintenance records.</p>
        </div>
      )}
    </div>
  );
}

// ── Checklists tab ───────────────────────────────────────────────────────────
function ChecklistsTab() {
  const [checklists, setChecklists] = useState([]);
  const [logs, setLogs] = useState([]);

  async function load() {
    const [cRes, lRes] = await Promise.all([
      api.get('/metrics/maintenance/checklists'),
      api.get('/metrics/maintenance/checklist-logs?limit=30'),
    ]);
    if (cRes.ok) setChecklists(await cRes.json());
    if (lRes.ok) setLogs(await lRes.json());
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      {checklists.length === 0 && (
        <div className="metal-card px-6 py-8 text-center">
          <p className="text-ink-400 text-sm">No checklists configured.</p>
        </div>
      )}
      {checklists.map((cl) => (
        <div key={cl.id} className="metal-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck size={14} className="text-arc" />
            <h3 className="text-sm font-semibold text-ink-100">{cl.name}</h3>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-arc/10 text-arc border border-arc/20 uppercase">{cl.checklist_type}</span>
          </div>
          <div className="space-y-1">
            {(cl.items || []).map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-xs text-ink-300">
                <Check size={10} className="text-ink-500" />
                {item.label}
              </div>
            ))}
          </div>
          {logs.filter((l) => l.checklist_id === cl.id).length > 0 && (
            <div className="mt-2 pt-2 border-t border-obsidian-700/30">
              <p className="text-[9px] text-ink-500 mb-1">Recent completions:</p>
              <div className="flex gap-2">
                {logs.filter((l) => l.checklist_id === cl.id).slice(0, 5).map((l) => (
                  <span key={l.id} className="text-[9px] font-mono text-ink-400">{formatDate(l.log_date)}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function FleetPage() {
  const [tab, setTab] = useState('vehicles');
  const [vehicles, setVehicles] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [summaries, setSummaries] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    year: new Date().getFullYear(), make: '', model: '', trim: '', vin: '', license_plate: '',
    color: '', ownership_type: 'rental', epa_mpg_city: '', epa_mpg_highway: '', epa_mpg_combined: '',
    fuel_tank_gal: '', tire_size: '', start_date: todayStr(), notes: '',
  });
  const [error, setError] = useState('');

  async function load() {
    const r = await api.get('/metrics/fleet/vehicles?include_retired=true');
    if (r.ok) setVehicles(await r.json());
  }

  useEffect(() => { load(); }, []);

  async function loadSummary(id) {
    if (summaries[id]) return;
    const r = await api.get(`/metrics/fleet/vehicles/${id}/summary`);
    if (r.ok) {
      const data = await r.json();
      setSummaries((s) => ({ ...s, [id]: data }));
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    const body = { ...form, year: Number(form.year) };
    if (body.epa_mpg_city) body.epa_mpg_city = Number(body.epa_mpg_city); else delete body.epa_mpg_city;
    if (body.epa_mpg_highway) body.epa_mpg_highway = Number(body.epa_mpg_highway); else delete body.epa_mpg_highway;
    if (body.epa_mpg_combined) body.epa_mpg_combined = Number(body.epa_mpg_combined); else delete body.epa_mpg_combined;
    if (body.fuel_tank_gal) body.fuel_tank_gal = Number(body.fuel_tank_gal); else delete body.fuel_tank_gal;
    if (!body.trim) delete body.trim;
    if (!body.vin) delete body.vin;
    if (!body.license_plate) delete body.license_plate;
    if (!body.color) delete body.color;
    if (!body.tire_size) delete body.tire_size;
    if (!body.notes) delete body.notes;
    const r = await api.post('/metrics/fleet/vehicles', body);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setShowForm(false);
    load();
  }

  async function handleRetire(id) {
    if (!window.confirm('Retire this vehicle?')) return;
    await api.put(`/metrics/fleet/vehicles/${id}`, { status: 'retired', end_date: todayStr() });
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this vehicle permanently?')) return;
    await api.delete(`/metrics/fleet/vehicles/${id}`);
    load();
  }

  function toggleExpand(id) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadSummary(id);
  }

  return (
    <div className="max-w-3xl xl:max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Fleet</h1>
          <p className="text-xs text-ink-400 mt-0.5">Vehicles, maintenance, and checklists</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-obsidian-700">
        {[['vehicles', 'Vehicles'], ['maintenance', 'Maintenance']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === id ? 'border-arc text-arc' : 'border-transparent text-ink-400 hover:text-ink-200'
            }`}>{label}</button>
        ))}
      </div>

      {tab === 'maintenance' && <MaintenanceTab />}

      {tab === 'vehicles' && (<>
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary text-xs gap-1.5">
          <Plus size={12} /> Add Vehicle
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {showForm && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">Add Vehicle</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Year</label>
                <input type="number" required min="1990" max="2035" className="arc-input text-sm font-light"
                  value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Make</label>
                <input type="text" required maxLength={64} className="arc-input text-sm font-light"
                  placeholder="Toyota" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Model</label>
                <input type="text" required maxLength={64} className="arc-input text-sm font-light"
                  placeholder="Camry" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Trim</label>
                <input type="text" maxLength={64} className="arc-input text-sm font-light"
                  placeholder="LE, SR+" value={form.trim} onChange={(e) => setForm({ ...form, trim: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">VIN</label>
                <input type="text" maxLength={17} className="arc-input text-sm font-light font-mono"
                  placeholder="17 characters" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">License Plate</label>
                <input type="text" maxLength={16} className="arc-input text-sm font-light font-mono"
                  value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Color</label>
                <input type="text" maxLength={32} className="arc-input text-sm font-light"
                  value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Ownership</label>
                <select className="arc-input text-sm font-light" value={form.ownership_type}
                  onChange={(e) => setForm({ ...form, ownership_type: e.target.value })}>
                  <option value="rental">Rental</option>
                  <option value="owned">Owned</option>
                  <option value="leased">Leased</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">MPG City</label>
                <input type="number" step="0.1" min="0" className="arc-input text-sm font-light font-mono"
                  value={form.epa_mpg_city} onChange={(e) => setForm({ ...form, epa_mpg_city: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">MPG Hwy</label>
                <input type="number" step="0.1" min="0" className="arc-input text-sm font-light font-mono"
                  value={form.epa_mpg_highway} onChange={(e) => setForm({ ...form, epa_mpg_highway: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">MPG Combined</label>
                <input type="number" step="0.1" min="0" className="arc-input text-sm font-light font-mono"
                  value={form.epa_mpg_combined} onChange={(e) => setForm({ ...form, epa_mpg_combined: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Tank (gal)</label>
                <input type="number" step="0.1" min="0" className="arc-input text-sm font-light font-mono"
                  value={form.fuel_tank_gal} onChange={(e) => setForm({ ...form, fuel_tank_gal: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Tire Size</label>
                <input type="text" maxLength={32} className="arc-input text-sm font-light font-mono"
                  placeholder="225/45R17" value={form.tire_size} onChange={(e) => setForm({ ...form, tire_size: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Start Date</label>
              <input type="date" required className="arc-input text-sm font-light w-40"
                value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs">Add Vehicle</button>
            </div>
          </form>
        </div>
      )}

      {vehicles.length === 0 && (
        <div className="metal-card px-6 py-8 text-center">
          <Car size={24} className="text-ink-500 mx-auto mb-2" />
          <p className="text-ink-400 text-sm">No vehicles registered.</p>
          <p className="text-ink-500 text-xs mt-1">Add your first vehicle to start tracking per-vehicle costs.</p>
        </div>
      )}

      {vehicles.map((v) => {
        const isExpanded = expanded === v.id;
        const sum = summaries[v.id];
        return (
          <div key={v.id} className={`metal-card overflow-hidden ${v.status === 'retired' ? 'opacity-50' : ''}`}>
            <button type="button" onClick={() => toggleExpand(v.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-obsidian-800/30 transition-colors">
              <Car size={16} className="text-arc shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink-100">{v.display_name}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${STATUS_STYLES[v.status]}`}>
                    {v.status}
                  </span>
                  <span className="text-[9px] text-ink-500 uppercase">{OWNERSHIP_LABELS[v.ownership_type]}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-ink-500 mt-0.5">
                  {v.vin && <span className="font-mono">{v.vin}</span>}
                  {v.license_plate && <span>· {v.license_plate}</span>}
                  {v.color && <span>· {v.color}</span>}
                  <span>· Since {v.start_date}</span>
                </div>
              </div>
              {isExpanded ? <ChevronUp size={14} className="text-ink-400" /> : <ChevronDown size={14} className="text-ink-400" />}
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-obsidian-700/50">
                {/* Specs */}
                {(v.epa_mpg_combined || v.fuel_tank_gal || v.tire_size) && (
                  <div className="flex flex-wrap gap-3 pt-3">
                    {v.epa_mpg_combined && <div><span className="text-[10px] text-ink-50 font-bold uppercase">EPA MPG</span><p className="text-xs font-mono text-ink-300">{v.epa_mpg_city}/{v.epa_mpg_highway}/{v.epa_mpg_combined}</p></div>}
                    {v.fuel_tank_gal && <div><span className="text-[10px] text-ink-50 font-bold uppercase">Tank</span><p className="text-xs font-mono text-ink-300">{v.fuel_tank_gal} gal</p></div>}
                    {v.tire_size && <div><span className="text-[10px] text-ink-50 font-bold uppercase">Tires</span><p className="text-xs font-mono text-ink-300">{v.tire_size}</p></div>}
                  </div>
                )}

                {/* Cost summary */}
                {sum ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="metal-card px-2.5 py-2">
                      <p className="text-[10px] text-ink-50 font-bold uppercase">Miles</p>
                      <p className="text-sm font-normal font-mono text-ink-300">{round1(sum.total_miles)}</p>
                    </div>
                    <div className="metal-card px-2.5 py-2">
                      <p className="text-[10px] text-ink-50 font-bold uppercase">Fuel Cost</p>
                      <p className="text-sm font-normal font-mono text-ink-300">{formatCurrency(sum.total_fuel_cost)}</p>
                    </div>
                    <div className="metal-card px-2.5 py-2">
                      <p className="text-[10px] text-ink-50 font-bold uppercase">Maintenance</p>
                      <p className="text-sm font-normal font-mono text-ink-300">{formatCurrency(sum.total_maintenance_cost)}</p>
                    </div>
                    <div className="metal-card px-2.5 py-2">
                      <p className="text-[10px] text-ink-50 font-bold uppercase">Cost/Mile</p>
                      <p className="text-sm font-normal font-mono text-ink-300">${sum.cost_per_mile}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-ink-500">Loading summary...</p>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {v.status === 'active' && (
                    <button onClick={() => handleRetire(v.id)} className="btn-ghost text-xs">Retire Vehicle</button>
                  )}
                  <button onClick={() => handleDelete(v.id)} className="text-xs text-ink-400 hover:text-error transition-colors">Delete</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      </>)}
    </div>
  );
}
