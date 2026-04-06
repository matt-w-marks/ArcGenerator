import { useState, useEffect } from 'react';
import { Database, Users, Tags, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import DataPage from './DataPage';
import UsersPage from './UsersPage';
import ExpenseCategoriesPage from './ExpenseCategoriesPage';

function ProfileTab() {
  const { user, loadProfile } = useAuth();
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwErrors, setPwErrors] = useState([]);
  const [pwCooldown, setPwCooldown] = useState(0);

  useEffect(() => {
    if (pwCooldown <= 0) return;
    const t = setInterval(() => setPwCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [pwCooldown]);

  function fmtCooldown(s) {
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${m}:${ss}`;
  }

  function scorePassword(pw) {
    if (!pw) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pw.length >= 12) score += 1;
    if (pw.length >= 16) score += 1;
    if (pw.length >= 20) score += 1;
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
    if (classes >= 2) score += 1;
    if (classes >= 3) score += 1;
    if (pw.length < 12) score = Math.min(score, 1);
    const levels = [
      { label: 'Too short', color: 'bg-error' },
      { label: 'Weak', color: 'bg-error' },
      { label: 'Fair', color: 'bg-warning' },
      { label: 'Good', color: 'bg-warning' },
      { label: 'Strong', color: 'bg-success' },
      { label: 'Excellent', color: 'bg-success' },
    ];
    return { score, ...levels[Math.min(score, 5)] };
  }
  const pwStrength = scorePassword(newPassword);

  useEffect(() => {
    setFirstName(user?.first_name || '');
    setLastName(user?.last_name || '');
    setPhone(user?.phone || '');
    setEmail(user?.email || '');
  }, [user?.first_name, user?.last_name, user?.phone, user?.email]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');
    const r = await api.put('/auth/profile', { first_name: firstName, last_name: lastName, phone, email });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || 'Failed to save');
      setSaving(false);
      return;
    }
    await loadProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handlePasswordChange() {
    setPwError('');
    setPwErrors([]);
    setPwSaved(false);
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    if (newPassword.length < 12) {
      setPwError('New password must be at least 12 characters');
      return;
    }
    setPwSaving(true);
    const hasPassword = user?.has_password !== false;
    const r = hasPassword
      ? await api.put('/auth/profile/password', { current_password: currentPassword, new_password: newPassword })
      : await api.put('/auth/profile/password/initial', { new_password: newPassword });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      if (r.status === 429 && d.retryAfter) {
        setPwCooldown(d.retryAfter);
        setPwError(d.error || 'Please wait before changing your password again');
      } else if (Array.isArray(d.errors) && d.errors.length) {
        setPwErrors(d.errors);
      } else {
        setPwError(d.error || 'Failed to change password');
      }
      setPwSaving(false);
      return;
    }
    setPwSaving(false);
    setPwSaved(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPwSaved(false), 3000);
  }

  return (
    <div className="max-w-md space-y-6">
      {/* Profile section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-ink-100">Personal Information</h3>
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">First Name</label>
            <input type="text" maxLength={64} className="arc-input text-sm font-light" placeholder="John"
              value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Last Name</label>
            <input type="text" maxLength={64} className="arc-input text-sm font-light" placeholder="Doe"
              value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Email</label>
          <input type="email" className="arc-input text-sm font-light" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Phone</label>
          <input type="tel" maxLength={32} className="arc-input text-sm font-light" placeholder="(555) 123-4567"
            value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Role</label>
          <p className="text-sm text-ink-300">{user?.role || '—'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
          {saved && <span className="text-xs text-success">Saved</span>}
        </div>
      </div>

      {/* Password section */}
      <div className="space-y-4 pt-4 border-t border-obsidian-700">
        <h3 className="text-sm font-semibold text-ink-100">
          {user?.has_password === false ? 'Set Password' : 'Change Password'}
        </h3>
        {user?.has_password === false && (
          <p className="text-[10px] text-ink-400">
            You sign in via Cloudflare email OTP. Setting a password is optional —
            it lets you also sign in via the local login page as a fallback.
          </p>
        )}
        {pwError && (
          <p className="text-xs text-error">
            {pwError}
            {pwCooldown > 0 && <> — try again in {fmtCooldown(pwCooldown)}</>}
          </p>
        )}
        {pwErrors.length > 0 && (
          <ul className="text-xs text-error list-disc list-inside space-y-0.5">
            {pwErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        {user?.has_password !== false && (
          <div>
            <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Current Password</label>
            <input type="password" className="arc-input text-sm font-light"
              value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
        )}
        <div>
          <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">New Password</label>
          <input type="password" className="arc-input text-sm font-light"
            value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          {newPassword && (
            <div className="mt-1.5 space-y-1">
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i < pwStrength.score ? pwStrength.color : 'bg-obsidian-700'}`}
                  />
                ))}
              </div>
              <p className="text-[9px] text-ink-400">Strength: <span className="font-semibold">{pwStrength.label}</span></p>
            </div>
          )}
          <p className="text-[9px] text-ink-500 mt-1">At least 12 characters. Cannot be a previously breached or recently used password.</p>
        </div>
        <div>
          <label className="text-[10px] text-ink-50 font-bold uppercase tracking-wide block mb-1">Confirm New Password</label>
          <input type="password" className="arc-input text-sm font-light"
            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handlePasswordChange}
            disabled={pwSaving || !newPassword || pwCooldown > 0 || (user?.has_password !== false && !currentPassword)}
            className="btn-primary text-xs"
          >
            {pwSaving ? 'Saving…' : (user?.has_password === false ? 'Set Password' : 'Change Password')}
          </button>
          {pwSaved && <span className="text-xs text-success">Password changed</span>}
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'profile', label: 'Profile', icon: User, roles: ['ADMIN', 'OPERATOR', 'VIEWER'] },
  { id: 'data', label: 'Data', icon: Database, roles: ['ADMIN', 'OPERATOR'] },
  { id: 'categories', label: 'Categories', icon: Tags, roles: ['ADMIN'] },
  { id: 'users', label: 'Users', icon: Users, roles: ['ADMIN'] },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const visibleTabs = TABS.filter((t) => t.roles.includes(user?.role));
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.id || 'profile');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="text-xs text-ink-400 mt-0.5">Profile, system configuration, and user management</p>
      </div>

      <div className="flex gap-1 border-b border-obsidian-700">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-arc text-arc'
                  : 'border-transparent text-ink-400 hover:text-ink-200'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'data' && <DataPage />}
      {activeTab === 'categories' && <ExpenseCategoriesPage />}
      {activeTab === 'users' && <UsersPage />}
    </div>
  );
}
