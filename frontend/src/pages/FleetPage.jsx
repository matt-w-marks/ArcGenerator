import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, AlertCircle, ChevronDown, ChevronUp, Car } from 'lucide-react';
import { api } from '../lib/api';
import { formatCurrency, round1 } from '../lib/utils';

const OWNERSHIP_LABELS = { rental: 'Rental', owned: 'Owned', leased: 'Leased' };
const STATUS_STYLES = { active: 'bg-success/15 text-success border-success/30', retired: 'bg-obsidian-700 text-ink-500' };

function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }

export default function FleetPage() {
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
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Fleet</h1>
          <p className="text-xs text-ink-400 mt-0.5">Vehicle registry and per-vehicle cost tracking</p>
        </div>
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
    </div>
  );
}
