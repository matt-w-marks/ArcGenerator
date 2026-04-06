import { useEffect, useState } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

const ROLES = ['ADMIN', 'OPERATOR', 'VIEWER'];
const ROLE_STYLES = {
  ADMIN:    'bg-error/15 text-error border-error/30',
  OPERATOR: 'bg-arc/15 text-arc border-arc/30',
  VIEWER:   'bg-success/15 text-success border-success/30',
};

function RoleBadge({ role }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${ROLE_STYLES[role] || 'bg-obsidian-700 text-ink-400'}`}>
      {role}
    </span>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add user form
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('OPERATOR');

  async function loadUsers() {
    const r = await api.get('/auth/users');
    if (r.ok) setUsers(await r.json());
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const r = await api.post('/auth/users', { email: newEmail, role: newRole });
    if (r.ok) {
      setShowCreate(false);
      setSuccess(`${newEmail} added. They can sign in via email OTP.`);
      setNewEmail(''); setNewRole('OPERATOR');
      loadUsers();
      setTimeout(() => setSuccess(''), 4000);
    } else {
      const body = await r.json().catch(() => ({}));
      setError(body.error || 'Failed to add user');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this user? This cannot be undone.')) return;
    await api.delete(`/auth/users/${id}`);
    loadUsers();
  }

  async function handleRoleChange(id, role) {
    await api.put(`/auth/users/${id}`, { role });
    loadUsers();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="text-xs text-ink-400 mt-0.5">Add users — they sign in with email OTP via Cloudflare</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)}
            className="btn-primary text-xs gap-1.5"><Plus size={12} /> Add User</button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {success && (
        <div className="px-3 py-2 rounded-lg bg-success/10 border border-success/30 text-success text-sm">
          {success}
        </div>
      )}

      {/* Add user form */}
      {showCreate && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">Add User</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Email</label>
                <input type="email" required className="arc-input text-sm font-light" placeholder="user@example.com"
                  value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Role</label>
                <select className="arc-input text-sm font-light" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <p className="text-[10px] text-ink-500">
              No password needed. They sign in by entering their email and the OTP code Cloudflare sends them.
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs">Add</button>
            </div>
          </form>
        </div>
      )}

      {/* Users list */}
      <div className="metal-card overflow-hidden">
        <div className="px-4 py-3 border-b border-obsidian-700">
          <h2 className="text-sm font-semibold text-ink-100">Active Users</h2>
        </div>
        <div className="divide-y divide-obsidian-700/30">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink-100 truncate">{u.email}</p>
                <p className="text-[10px] text-ink-500 font-mono">{u.id.slice(0, 8)}… · {new Date(u.created_at).toLocaleDateString()}</p>
              </div>
              <select className="arc-input text-xs font-light py-1 w-28" value={u.role}
                onChange={(e) => handleRoleChange(u.id, e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <RoleBadge role={u.role} />
              <button onClick={() => handleDelete(u.id)}
                className="text-ink-400 hover:text-error transition-colors p-1">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
