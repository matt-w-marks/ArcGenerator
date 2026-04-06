import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, verify any stored token
  async function loadProfile() {
    const pr = await api.get('/auth/profile');
    if (pr.ok) {
      const p = await pr.json();
      setUser({ sub: p.id, role: p.role, first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone, has_password: p.has_password });
    }
  }

  useEffect(() => {
    (async () => {
      try {
        // 1. If we don't already have tokens, try Cloudflare SSO bootstrap.
        //    This is silent — the CF JWT is already in the request via the proxy.
        if (!api.isAuthenticated()) {
          const ok = await api.bootstrapSso();
          if (!ok) {
            setLoading(false);
            return;
          }
        }

        // 2. Verify whatever token we now have and load profile
        const r = await api.get('/auth/verify');
        const data = r.ok ? await r.json() : null;
        if (data?.valid) {
          setUser({ sub: data.sub, role: data.role });
          await loadProfile();
        } else {
          await api.logout();
        }
      } catch {
        await api.logout();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email, password) {
    await api.login(email, password);
    await loadProfile();
  }

  async function logout() {
    await api.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, loadProfile, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
