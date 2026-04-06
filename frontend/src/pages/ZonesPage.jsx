import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, AlertCircle, MapPin, Zap } from 'lucide-react';
import { api } from '../lib/api';

const ZONE_TYPE_DESCRIPTIONS = {
  Anchor: 'Fixed staging — queue-based, position-dependent. PHX terminals, arena lots.',
  Core:   'High-density residential & commercial. Consistent demand all day.',
  Steady: 'Moderate consistent demand. Venue corridors & hotel rows.',
  Events: 'Scheduled event-driven demand. Activate on event calendar.',
  Surge:  'Time-gated burst demand. Position before the window opens.',
};
const ZONE_TYPES = ['Anchor', 'Core', 'Steady', 'Events', 'Surge'];
const SERVICE_TYPES = ['Rides', 'Food', 'Rest'];
const IMPACT_TYPES = ['High Surge', 'Steady Boost'];

export default function ZonesPage() {
  const [tab, setTab] = useState('zones');
  const [zones, setZones] = useState([]);
  const [events, setEvents] = useState([]);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [zoneForm, setZoneForm] = useState({ name: '', zone_type: '', address: '', geo_lat: '', geo_lng: '', service_types: [] });
  const [eventForm, setEventForm] = useState({ zone_id: '', event_name: '', activation_window: '', impact: '', week_of: '' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [zRes, eRes] = await Promise.all([
      api.get('/metrics/zones'),
      api.get('/metrics/zones/events'),
    ]);
    if (zRes.ok) setZones(await zRes.json());
    if (eRes.ok) setEvents(await eRes.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleService(type) {
    setZoneForm((f) => ({
      ...f,
      service_types: f.service_types.includes(type) ? f.service_types.filter((t) => t !== type) : [...f.service_types, type],
    }));
  }

  async function handleAddZone(e) {
    e.preventDefault();
    setError('');
    const body = {
      name: zoneForm.name.trim(), zone_type: zoneForm.zone_type || null,
      address: zoneForm.address.trim() || null,
      geo_lat: zoneForm.geo_lat ? Number(zoneForm.geo_lat) : null,
      geo_lng: zoneForm.geo_lng ? Number(zoneForm.geo_lng) : null,
      service_types: zoneForm.service_types.length ? zoneForm.service_types : null,
    };
    const r = await api.post('/metrics/zones', body);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setZoneForm({ name: '', zone_type: '', address: '', geo_lat: '', geo_lng: '', service_types: [] });
    setShowAddZone(false);
    load();
  }

  async function handleDeleteZone(id) {
    if (!window.confirm('Delete this zone?')) return;
    await api.delete(`/metrics/zones/${id}`);
    load();
  }

  async function handleAddEvent(e) {
    e.preventDefault();
    setError('');
    const body = {
      zone_id: eventForm.zone_id, event_name: eventForm.event_name.trim(),
      activation_window: eventForm.activation_window.trim(),
      impact: eventForm.impact, week_of: eventForm.week_of,
    };
    const r = await api.post('/metrics/zones/events', body);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
    setEventForm({ zone_id: '', event_name: '', activation_window: '', impact: '', week_of: '' });
    setShowAddEvent(false);
    load();
  }

  async function handleDeleteEvent(id) {
    await api.delete(`/metrics/zones/events/${id}`);
    load();
  }

  const zonesByType = ZONE_TYPES.reduce((acc, t) => {
    acc[t] = zones.filter((z) => z.zone_type === t);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl xl:max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Zones</h1>
          <p className="text-xs text-ink-400 mt-0.5">{zones.length} zones, {events.length} events</p>
        </div>
        <div className="flex gap-2">
          {tab === 'zones' && <button onClick={() => setShowAddZone(true)} className="btn-primary text-xs gap-1.5"><Plus size={12} /> Add Zone</button>}
          {tab === 'events' && <button onClick={() => setShowAddEvent(true)} className="btn-primary text-xs gap-1.5"><Plus size={12} /> Add Event</button>}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-obsidian-700">
        {[['zones', 'Zones', MapPin], ['events', 'Events', Zap]].map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === id ? 'border-arc text-arc' : 'border-transparent text-ink-400 hover:text-ink-200'
            }`}>
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {tab === 'zones' && <>
      {/* Add Zone form */}
      {showAddZone && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">New Zone</h3>
          <form onSubmit={handleAddZone} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Zone Name *</label>
                <input type="text" required maxLength={64} className="arc-input text-sm font-light"
                  placeholder="Downtown, Airport North" value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Type</label>
                <select className="arc-input text-sm font-light" value={zoneForm.zone_type} onChange={(e) => setZoneForm({ ...zoneForm, zone_type: e.target.value })}>
                  <option value="">Select type...</option>
                  {ZONE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {zoneForm.zone_type && <p className="text-[9px] text-ink-500 mt-0.5">{ZONE_TYPE_DESCRIPTIONS[zoneForm.zone_type]}</p>}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Address</label>
              <input type="text" className="arc-input text-sm font-light" placeholder="3400 E Sky Harbor Blvd, Phoenix, AZ"
                value={zoneForm.address} onChange={(e) => setZoneForm({ ...zoneForm, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Latitude</label>
                <div className="relative">
                  <MapPin size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
                  <input type="text" inputMode="decimal" className="arc-input text-sm font-light pl-7" placeholder="33.437969"
                    value={zoneForm.geo_lat} onChange={(e) => setZoneForm({ ...zoneForm, geo_lat: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Longitude</label>
                <div className="relative">
                  <MapPin size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
                  <input type="text" inputMode="decimal" className="arc-input text-sm font-light pl-7" placeholder="-112.007507"
                    value={zoneForm.geo_lng} onChange={(e) => setZoneForm({ ...zoneForm, geo_lng: e.target.value })} />
                </div>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Service Types</label>
              <div className="flex gap-3">
                {SERVICE_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-arc" checked={zoneForm.service_types.includes(t)} onChange={() => toggleService(t)} />
                    <span className="text-xs text-ink-200">{t}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAddZone(false)} className="btn-ghost text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs">Add Zone</button>
            </div>
          </form>
        </div>
      )}

      {/* Zone list by type */}
      {ZONE_TYPES.map((type) => {
        const typeZones = zonesByType[type];
        if (typeZones.length === 0) return null;
        return (
          <div key={type}>
            <h3 className="text-[10px] text-ink-50 font-bold uppercase tracking-wide mb-2">{type} Zones</h3>
            <div className="metal-card overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {typeZones.map((z) => (
                    <tr key={z.id} className="border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-ink-100">{z.name}</p>
                        {z.address && <p className="text-[9px] text-ink-500 mt-0.5">{z.address}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-400">
                        {z.service_types?.join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-ink-500">
                        {z.geo_lat && z.geo_lng ? `${z.geo_lat}, ${z.geo_lng}` : '—'}
                      </td>
                      <td className="px-2 py-3">
                        <button onClick={() => handleDeleteZone(z.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {zones.length === 0 && !showAddZone && (
        <div className="metal-card px-6 py-8 text-center">
          <p className="text-ink-400 text-sm">No zones set up.</p>
          <p className="text-ink-500 text-xs mt-1">Add your rideshare zones to plan schedules around.</p>
        </div>
      )}
      </>}

      {tab === 'events' && <>
      {/* Add Event form */}
      {showAddEvent && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">New Event</h3>
          <form onSubmit={handleAddEvent} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Zone *</label>
                <select className="arc-input text-sm font-light" required value={eventForm.zone_id} onChange={(e) => setEventForm({ ...eventForm, zone_id: e.target.value })}>
                  <option value="">Select zone...</option>
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Week Of *</label>
                <input type="date" required className="arc-input text-sm font-light" value={eventForm.week_of} onChange={(e) => setEventForm({ ...eventForm, week_of: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Event Name *</label>
                <input type="text" required maxLength={128} className="arc-input text-sm font-light" placeholder="Suns vs Lakers"
                  value={eventForm.event_name} onChange={(e) => setEventForm({ ...eventForm, event_name: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Activation Window *</label>
                <input type="text" required maxLength={64} className="arc-input text-sm font-light" placeholder="6:00 PM – 11:30 PM"
                  value={eventForm.activation_window} onChange={(e) => setEventForm({ ...eventForm, activation_window: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Impact *</label>
                <select className="arc-input text-sm font-light" required value={eventForm.impact} onChange={(e) => setEventForm({ ...eventForm, impact: e.target.value })}>
                  <option value="">Select...</option>
                  {IMPACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAddEvent(false)} className="btn-ghost text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs">Add Event</button>
            </div>
          </form>
        </div>
      )}

      {/* Events */}
      {events.length > 0 && (
        <div>
          <h3 className="text-[10px] text-ink-50 font-bold uppercase tracking-wide mb-2">Upcoming Events</h3>
          <div className="metal-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-obsidian-600">
                  <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Event</th>
                  <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Zone</th>
                  <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Window</th>
                  <th className="text-center text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Impact</th>
                  <th className="text-left text-[10px] text-ink-50 font-bold uppercase tracking-wide px-4 py-3">Week Of</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-b border-obsidian-700/30 hover:bg-obsidian-800/30 transition-colors">
                    <td className="px-4 py-3 text-ink-100">{ev.event_name}</td>
                    <td className="px-4 py-3 text-ink-300">{ev.zone_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-ink-400">{ev.activation_window}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        ev.impact === 'High Surge' ? 'bg-error/15 text-error border border-error/30' : 'bg-success/15 text-success border border-success/30'
                      }`}>{ev.impact}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-ink-400">{ev.week_of}</td>
                    <td className="px-2 py-3">
                      <button onClick={() => handleDeleteEvent(ev.id)} className="text-ink-400 hover:text-error p-0.5 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {events.length === 0 && !showAddEvent && (
        <div className="metal-card px-6 py-8 text-center">
          <p className="text-ink-400 text-sm">No events scheduled.</p>
          <p className="text-ink-500 text-xs mt-1">Add events for surge windows and special opportunities.</p>
        </div>
      )}
      </>}
    </div>
  );
}
