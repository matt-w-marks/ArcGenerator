/**
 * API client for the RoadMap Dashboard.
 * All requests go to the gateway via relative URLs (Vite dev proxy in dev,
 * same-origin in production). No API URL is embedded in the bundle.
 *
 * Tokens are stored in localStorage so sessions survive page reloads.
 * On 401, the client automatically attempts a token refresh once before
 * clearing credentials and redirecting to /login.
 */

const KEYS = { access: 'rm_at', refresh: 'rm_rt' };

function getTokens() {
  return {
    access: localStorage.getItem(KEYS.access),
    refresh: localStorage.getItem(KEYS.refresh),
  };
}

function saveTokens(access, refresh) {
  localStorage.setItem(KEYS.access, access);
  if (refresh) localStorage.setItem(KEYS.refresh, refresh);
}

function clearTokens() {
  localStorage.removeItem(KEYS.access);
  localStorage.removeItem(KEYS.refresh);
}

async function tryRefresh() {
  const { refresh } = getTokens();
  if (!refresh) return false;
  try {
    const res = await fetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    saveTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function request(method, path, body) {
  const { access } = getTokens();
  const headers = { 'Content-Type': 'application/json' };
  if (access) headers['Authorization'] = `Bearer ${access}`;

  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res = await fetch(path, init);

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getTokens().access}`;
      res = await fetch(path, { method, headers, body: init.body });
    } else {
      clearTokens();
      window.location.href = '/login';
      return res;
    }
  }

  return res;
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  put:    (path, body)  => request('PUT',    path, body),
  delete: (path)        => request('DELETE', path),

  async login(email, password) {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Login failed');
    }
    const data = await res.json();
    saveTokens(data.accessToken, data.refreshToken);
    return data;
  },

  async logout() {
    const { refresh } = getTokens();
    if (refresh) {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      }).catch(() => {});
    }
    clearTokens();
  },

  isAuthenticated() {
    return !!getTokens().access;
  },
};
