import { useEffect, useState } from 'react';
import { Plus, Trash2, Copy, Check, AlertCircle, Link2 } from 'lucide-react';
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
  const [invites, setInvites] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState('');

  // Create user form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('OPERATOR');

  // Invite form
  const [inviteRole, setInviteRole] = useState('OPERATOR');
  const [inviteEmail, setInviteEmail] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  async function loadUsers() {
    const r = await api.get('/auth/users');
    if (r.ok) setUsers(await r.json());
  }

  async function loadInvites() {
    const r = await api.get('/auth/users/invites');
    if (r.ok) setInvites(await r.json());
  }

  useEffect(() => { loadUsers(); loadInvites(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    const r = await api.post('/auth/users', { email: newEmail, password: newPassword, role: newRole });
    if (r.ok) {
      setShowCreate(false);
      setNewEmail(''); setNewPassword(''); setNewRole('OPERATOR');
      loadUsers();
    } else {
      const body = await r.json().catch(() => ({}));
      setError(body.error || 'Failed to create user');
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

  async function handleGenerateInvite(e) {
    e.preventDefault();
    setError('');
    const r = await api.post('/auth/users/invites', { role: inviteRole, email: inviteEmail || undefined });
    if (r.ok) {
      const data = await r.json();
      const link = `${window.location.origin}/invite/${data.token}`;
      setGeneratedLink(link);
      loadInvites();
    } else {
      const body = await r.json().catch(() => ({}));
      setError(body.error || 'Failed to generate invite');
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="text-xs text-ink-400 mt-0.5">Manage accounts and invite new users</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowInvite(true); setShowCreate(false); setGeneratedLink(''); }}
            className="btn-ghost text-xs gap-1.5"><Link2 size={12} /> Invite</button>
          <button onClick={() => { setShowCreate(true); setShowInvite(false); }}
            className="btn-primary text-xs gap-1.5"><Plus size={12} /> Create User</button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Create user form */}
      {showCreate && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">Create User</h3>
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
            <div>
              <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Password</label>
              <input type="password" required minLength={8} className="arc-input text-sm font-light" placeholder="Min 8 characters"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div className="metal-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-100">Generate Invite Link</h3>
          <form onSubmit={handleGenerateInvite} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Role</label>
                <select className="arc-input text-sm font-light" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Email (optional)</label>
                <input type="email" className="arc-input text-sm font-light" placeholder="Pre-assign email"
                  value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowInvite(false)} className="btn-ghost text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs">Generate</button>
            </div>
          </form>
          {generatedLink && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-obsidian-800/60 border border-obsidian-700/50">
              <input type="text" readOnly className="arc-input text-xs font-light font-mono flex-1" value={generatedLink} />
              <button onClick={copyLink} className="btn-ghost text-xs gap-1">
                {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
              </button>
            </div>
          )}
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

      {/* Invites list */}
      {invites.length > 0 && (
        <div className="metal-card overflow-hidden">
          <div className="px-4 py-3 border-b border-obsidian-700">
            <h2 className="text-sm font-semibold text-ink-100">Invites</h2>
          </div>
          <div className="divide-y divide-obsidian-700/30">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
                <RoleBadge role={inv.role} />
                <span className="text-xs text-ink-300 truncate flex-1">{inv.email || 'Any email'}</span>
                <span className="text-[10px] text-ink-500 font-mono">
                  {inv.used_at ? 'Used' : new Date(inv.expires_at) < new Date() ? 'Expired' : `Expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
