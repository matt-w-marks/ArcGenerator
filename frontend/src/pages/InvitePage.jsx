import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Map, AlertCircle, Check } from 'lucide-react';

export default function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/auth/invites/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          setError(body.error || 'Invalid or expired invite');
          return;
        }
        const data = await r.json();
        setInvite(data);
        if (data.email) setEmail(data.email);
      })
      .catch(() => setError('Failed to validate invite'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const r = await fetch(`/auth/invites/${token}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (r.ok) {
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } else {
      const body = await r.json().catch(() => ({}));
      setError(body.error || 'Failed to create account');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 forge-grid">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-arc/10 arc-glow mb-4">
            <Map size={28} className="text-arc" />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink-50">ArcGenerator</h1>
          <p className="text-ink-400 text-sm mt-1">You've been invited</p>
        </div>

        <div className="metal-card p-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 border-arc border-t-transparent animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {success && (
            <div className="text-center space-y-3 py-4">
              <Check size={32} className="text-success mx-auto" />
              <p className="text-sm text-ink-100">Account created! Redirecting to login…</p>
            </div>
          )}

          {invite && !success && (
            <>
              <div className="flex items-center gap-2 mb-5">
                <h2 className="font-display text-lg font-semibold text-ink-50">Set up your account</h2>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                  invite.role === 'ADMIN' ? 'bg-error/15 text-error border-error/30' :
                  invite.role === 'OPERATOR' ? 'bg-arc/15 text-arc border-arc/30' :
                  'bg-success/15 text-success border-success/30'
                }`}>{invite.role}</span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-ink-50 uppercase tracking-wider block mb-1.5" htmlFor="invite-email">Email</label>
                  <input id="invite-email" type="email" required className="arc-input font-light"
                    placeholder="username@example.com" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={!!invite.email} />
                </div>
                <div>
                  <label className="text-xs font-bold text-ink-50 uppercase tracking-wider block mb-1.5" htmlFor="invite-password">Password</label>
                  <input id="invite-password" type="password" required minLength={8} className="arc-input font-light"
                    placeholder="Min 8 characters" value={password}
                    onChange={(e) => setPassword(e.target.value)} />
                </div>
                <button type="submit" className="btn-primary w-full mt-2">Create Account</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
