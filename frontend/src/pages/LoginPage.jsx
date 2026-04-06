import { useState, useEffect } from 'react';
import { Map, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function fmt(s) {
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${m}:${ss}`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err.status === 429 && err.retryAfter) {
        setCooldown(err.retryAfter);
      }
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 forge-grid">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-arc/10 arc-glow mb-4">
            <Map size={28} className="text-arc" />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink-50">ArcGenerator</h1>
          <p className="text-ink-400 text-sm mt-1">RevOps</p>
        </div>

        {/* Card */}
        <div className="metal-card p-6">
          <h2 className="font-display text-lg font-semibold text-ink-50 mb-5">Sign in</h2>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-sm mb-4">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>
                {error}
                {cooldown > 0 && <> — try again in {fmt(cooldown)}</>}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-ink-50 uppercase tracking-wider block mb-1.5" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="arc-input font-light"
                placeholder="username@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-ink-50 uppercase tracking-wider block mb-1.5" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="arc-input font-light"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading || cooldown > 0}
              className="btn-primary w-full mt-2"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-[10px] text-ink-500 mt-4 text-center leading-relaxed">
            Normally you'll be signed in automatically via Cloudflare email OTP.
            Use this form only if you have a local password set as a fallback.
          </p>
        </div>
      </div>
    </div>
  );
}
