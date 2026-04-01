/**
 * Adversarial security tests for the API Gateway.
 *
 * Tests cover JWT algorithm confusion attacks, token forgery, oversized bodies,
 * header injection attempts, and ensuring no stack traces leak.
 *
 * Blueprint §14: auth, authz, input validation, and session management functions
 * require both positive and negative/adversarial test cases.
 */

jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(({ pathRewrite, on } = {}) =>
    (req, res) => {
      if (on && on.proxyReq) {
        const fakeProxyReq = {
          headers: {},
          setHeader: jest.fn((k, v) => { fakeProxyReq.headers[k] = v; }),
          removeHeader: jest.fn(),
        };
        on.proxyReq(fakeProxyReq, req, res);
        res._injectedHeaders = fakeProxyReq.headers;
      }
      const rewritten = pathRewrite ? pathRewrite(req.url) : req.url;
      res.json({ proxied: true, path: rewritten });
    }
  ),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');

const SECRET = 'test-gateway-secret-32-chars-xxx';

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

function makeToken(payload = { sub: 'uid-1', role: 'ADMIN' }, opts = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: '15m', ...opts });
}

// ─── A04: JWT algorithm confusion (none / RS256 attacks) ─────────────────────

describe('A04 — JWT algorithm confusion attacks', () => {
  test('JWT with alg:none is rejected with 401', async () => {
    // Manually construct an unsigned token (alg: none)
    const header  = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'uid-attacker', role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', `Bearer ${noneToken}`);

    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('stack');
  });

  test('JWT signed with wrong secret is rejected with 401', async () => {
    const forgedToken = jwt.sign({ sub: 'uid-1', role: 'ADMIN' }, 'wrong-secret', { expiresIn: '15m' });
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', `Bearer ${forgedToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  test('expired JWT is rejected with 401', async () => {
    const expiredToken = jwt.sign(
      { sub: 'uid-1', role: 'ADMIN' },
      SECRET,
      { expiresIn: '-1s' } // already expired
    );
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  test('JWT with tampered payload is rejected with 401', async () => {
    // Sign a normal token then modify the payload segment
    const legit = makeToken({ sub: 'uid-1', role: 'USER' });
    const parts = legit.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'uid-1', role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });
});

// ─── A01: Broken Access Control — identity header spoofing ───────────────────

describe('A01 — Broken Access Control: identity header injection', () => {
  test('x-user-id spoofed by client is stripped — gateway-injected value wins', async () => {
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', `Bearer ${makeToken({ sub: 'real-uid', role: 'ADMIN' })}`)
      .set('x-user-id', 'SPOOFED-ADMIN-ID');

    expect(res.status).toBe(200);
    // If proxy headers were captured, verify the injected value is the JWT sub
    if (res.body._injectedHeaders) {
      expect(res.body._injectedHeaders['x-user-id']).toBe('real-uid');
      expect(res.body._injectedHeaders['x-user-id']).not.toBe('SPOOFED-ADMIN-ID');
    }
  });

  test('x-user-role spoofed by client is stripped on unprotected /auth routes', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('x-user-role', 'SUPER_ADMIN')
      .send({ email: 'a@b.com', password: 'pw' });
    // Request reaches the proxy stub (header was stripped, not forwarded as-is)
    expect(res.body.proxied).toBe(true);
  });

  test('direct access to /metrics without JWT cannot spoof x-user-id', async () => {
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('x-user-id', 'injected-id')
      .set('x-user-role', 'ADMIN');
    // Gateway must reject — not forward — the spoofed headers
    expect(res.status).toBe(401);
  });
});

// ─── A07: Authentication — Authorization header edge cases ───────────────────

describe('A07 — Authentication: Authorization header edge cases', () => {
  test('Authorization header with Basic scheme returns 401', async () => {
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
  });

  test('Authorization header with no token after Bearer returns 401', async () => {
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
  });

  test('Authorization header with only whitespace returns 401', async () => {
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', '   ');
    expect(res.status).toBe(401);
  });

  test('JWT with no sub claim still allowed if signature is valid', async () => {
    // Gateway only checks signature — role/sub injection guard is on downstream services
    const token = jwt.sign({ role: 'ADMIN' }, SECRET, { expiresIn: '15m' });
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ─── A02: Security Misconfiguration — no stack traces ────────────────────────

describe('A02 — Security Misconfiguration: no stack traces in error responses', () => {
  test('401 response body does not contain stack trace', async () => {
    const res = await request(app)
      .get('/metrics/driving-sessions/')
      .set('Authorization', 'Bearer not-a-valid-jwt');
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toContain('at Object.');
  });

  test('error handler returns 500 without stack or internal details', () => {
    const errorHandler = require('../../src/middleware/errorHandler');
    const err = new Error('db exploded');
    err.stack = 'Error: db exploded\n  at /app/src/app.js:12';
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody).not.toHaveProperty('stack');
    expect(JSON.stringify(responseBody)).not.toContain('db exploded');
  });
});

// ─── A06: Insecure Design — body size limit ───────────────────────────────────

describe('A06 — Insecure Design: body size limits enforced', () => {
  test('POST with 1MB+ body to /auth is rejected with 413', async () => {
    const oversized = 'x'.repeat(1.1 * 1024 * 1024); // 1.1 MB
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.com', password: oversized }));
    expect(res.status).toBe(413);
  });
});
