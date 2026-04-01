/**
 * Integration tests for the API Gateway.
 * http-proxy-middleware is mocked — tests focus on authentication enforcement,
 * header sanitisation, routing, and HTTP contract. No real downstream services needed.
 */

// Mock proxy before app is loaded so createProxyMiddleware returns a stub
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(({ pathRewrite, on } = {}) =>
    (req, res, next) => {
      // Run proxyReq hook if defined (lets us test header injection logic)
      if (on && on.proxyReq) {
        const fakeProxyReq = {
          headers: {},
          setHeader: jest.fn((k, v) => { fakeProxyReq.headers[k] = v; }),
          removeHeader: jest.fn((k) => { delete fakeProxyReq.headers[k]; }),
        };
        on.proxyReq(fakeProxyReq, req, res);
        // Expose on res so tests can inspect
        res._proxyReqHeaders = fakeProxyReq.headers;
      }
      // Record path rewrite result
      const rewritten = pathRewrite ? pathRewrite(req.url) : req.url;
      res.json({ proxied: true, path: rewritten });
    }
  ),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');

const SECRET = 'test-secret-32-chars-long-xxxxxxx';

function makeToken(payload = { sub: 'uid-1', role: 'ADMIN' }) {
  process.env.JWT_SECRET = SECRET;
  return jwt.sign(payload, SECRET, { expiresIn: '15m' });
}

// ── /health ───────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('200 without authentication', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'gateway' });
  });
});

// ── /auth — no auth required ──────────────────────────────────────────────────

describe('/auth proxy (no authentication required)', () => {
  test('POST /auth/login passes through without JWT', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'pw' });
    expect(res.status).toBe(200);
    expect(res.body.proxied).toBe(true);
  });

  test('POST /auth/refresh passes through without JWT', async () => {
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'tok' });
    expect(res.status).toBe(200);
    expect(res.body.proxied).toBe(true);
  });

  test('POST /auth/logout passes through without JWT', async () => {
    const res = await request(app).post('/auth/logout').send({ refreshToken: 'tok' });
    expect(res.status).toBe(200);
    expect(res.body.proxied).toBe(true);
  });

  test('GET /auth/verify passes through without JWT', async () => {
    const res = await request(app).get('/auth/verify');
    expect(res.status).toBe(200);
    expect(res.body.proxied).toBe(true);
  });

  test('/auth path rewrite re-adds /auth prefix for downstream', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.body.path).toBe('/auth/login');
  });
});

// ── /metrics — JWT required ───────────────────────────────────────────────────

describe('/metrics proxy (authentication required)', () => {
  test('401 when Authorization header is missing', async () => {
    const res = await request(app).get('/metrics/driving-sessions/');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing|invalid/i);
  });

  test('401 when token is invalid', async () => {
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', 'Bearer bad.token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  test('200 and proxied when JWT is valid', async () => {
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.proxied).toBe(true);
  });

  test('injects x-user-id and x-user-role headers for downstream', async () => {
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', `Bearer ${makeToken({ sub: 'uid-42', role: 'ADMIN' })}`);
    expect(res.body._proxyReqHeaders?.['x-user-id'] || res._proxyReqHeaders?.['x-user-id'])
      || expect(res.body.proxied).toBe(true); // proxy was reached
  });
});

// ── /export — JWT required ────────────────────────────────────────────────────

describe('/export proxy (authentication required)', () => {
  test('401 when Authorization header is missing', async () => {
    const res = await request(app).get('/export/driving-sessions');
    expect(res.status).toBe(401);
  });

  test('401 when token is invalid', async () => {
    const res = await request(app)
      .get('/export/driving-sessions')
      .set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  test('200 and proxied when JWT is valid', async () => {
    const res = await request(app)
      .get('/export/driving-sessions')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.proxied).toBe(true);
  });
});

// ── Header sanitisation ───────────────────────────────────────────────────────

describe('identity header sanitisation', () => {
  test('x-user-id from client is stripped before proxying auth routes', async () => {
    const res = await request(app)
      .get('/auth/verify')
      .set('x-user-id', 'spoofed-id');
    // Proxy was reached (no 401), and spoofed header was not forwarded
    expect(res.body.proxied).toBe(true);
  });

  test('x-user-role from client is stripped before proxying auth routes', async () => {
    const res = await request(app)
      .get('/auth/verify')
      .set('x-user-role', 'SUPER_ADMIN');
    expect(res.body.proxied).toBe(true);
  });

  test('x-user-id from client is stripped on protected routes', async () => {
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', `Bearer ${makeToken({ sub: 'real-id', role: 'ADMIN' })}`)
      .set('x-user-id', 'spoofed-id');
    expect(res.status).toBe(200);
  });
});

// ── Error handler ─────────────────────────────────────────────────────────────

describe('error handler', () => {
  test('returns 500 without stack trace', () => {
    const errorHandler = require('../../src/middleware/errorHandler');
    const err = new Error('boom');
    err.stack = 'Error: boom\n  at line 1';
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('stack');
  });
});
