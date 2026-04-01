import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, verify any stored token
  useEffect(() => {
    if (!api.isAuthenticated()) {
      setLoading(false);
      return;
    }
    api.get('/auth/verify')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.valid) {
          setUser({ sub: data.sub, role: data.role });
        } else {
          api.logout();
        }
      })
      .catch(() => api.logout())
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    await api.login(email, password);
    const r = await api.get('/auth/verify');
    const data = await r.json();
    setUser({ sub: data.sub, role: data.role });
  }

  async function logout() {
    await api.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
