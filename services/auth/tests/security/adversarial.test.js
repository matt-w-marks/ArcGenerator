/**
 * Adversarial security tests for the auth service.
 * These tests verify that attack patterns are rejected correctly and that
 * responses never leak sensitive data (password hashes, stack traces, internals).
 *
 * Blueprint §14: auth, authz, input validation, and session management functions
 * require both positive and negative/adversarial test cases.
 */

jest.mock('../../src/db/sequelize', () => ({
  define: jest.fn(() => ({})),
  getQueryInterface: jest.fn(),
}));
jest.mock('../../src/db/migrate', () => ({ migrate: jest.fn() }));
jest.mock('../../src/db/seed', () => ({ seed: jest.fn() }));
jest.mock('../../src/models/User', () => ({
  findOne: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
  hasMany: jest.fn(),
}));
jest.mock('../../src/models/RefreshToken', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  belongsTo: jest.fn(),
}));
// Suppress factory_log DB calls in tests
jest.mock('../../src/services/factoryLog', () => ({ logEvent: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const User = require('../../src/models/User');
const RefreshToken = require('../../src/models/RefreshToken');
const authService = require('../../src/services/authService');

beforeEach(() => jest.clearAllMocks());

// ─── A05: Injection — SQL injection payloads in login fields ─────────────────

describe('A05 — Injection: SQL-like payloads in login fields', () => {
  test("email with SQL OR injection is handled as unknown user (not a 500)", async () => {
    // ORM parameterizes queries; SQL injection strings are treated as literal values
    User.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: "' OR '1'='1", password: 'anything' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
    expect(res.body).not.toHaveProperty('stack');
  });

  test('email with semicolon injection returns 401, not 500', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@b.com; DROP TABLE users;--', password: 'pw' });
    expect(res.status).toBe(401);
  });

  test('unicode null bytes in email are handled gracefully', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@b.com\x00', password: 'pw' });
    expect([400, 401]).toContain(res.status);
    expect(res.body).not.toHaveProperty('stack');
  });
});

// ─── A01: Broken Access Control — response body never leaks sensitive data ────

describe('A01 — Broken Access Control: response body must not leak internals', () => {
  test('failed login response never contains password_hash', async () => {
    User.findOne.mockResolvedValue({
      id: 'uid',
      email: 'a@b.com',
      password_hash: '$2a$12$supersecret',
      role: 'ADMIN',
      failed_attempts: 0,
      locked_until: null,
      update: jest.fn(),
    });
    jest.spyOn(authService, 'comparePassword').mockResolvedValue(false);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'wrong' });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('password_hash');
    expect(body).not.toContain('supersecret');
    expect(body).not.toContain('$2a$');
  });

  test('successful login response never contains password_hash', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const updateMock = jest.fn().mockResolvedValue(undefined);
    User.findOne.mockResolvedValue({
      id: 'uid-1',
      email: 'a@b.com',
      password_hash: '$2a$12$supersecret',
      role: 'ADMIN',
      failed_attempts: 0,
      locked_until: null,
      update: updateMock,
    });
    jest.spyOn(authService, 'comparePassword').mockResolvedValue(true);
    RefreshToken.create.mockResolvedValue({});

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'correct' });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('password_hash');
    expect(body).not.toContain('supersecret');
    expect(body).not.toContain('$2a$');
    expect(res.status).toBe(200);
  });

  test('verify endpoint never returns user email or password data', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const token = authService.generateAccessToken('uid-1', 'ADMIN');
    const res = await request(app)
      .get('/auth/verify')
      .set('Authorization', `Bearer ${token}`);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('password');
    expect(body).not.toContain('email');
    expect(res.body).toMatchObject({ valid: true, sub: 'uid-1', role: 'ADMIN' });
  });
});

// ─── A10: Error Handling — no stack traces in any error response ──────────────

describe('A10 — Exception Handling: no stack traces exposed', () => {
  test('DB error during login returns 500 without stack or error message', async () => {
    User.findOne.mockRejectedValue(new Error('pg: connection refused'));
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'pw' });
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
    expect(res.body.error).toBe('Internal server error');
  });

  test('DB error during refresh returns 500 without stack', async () => {
    RefreshToken.findOne.mockRejectedValue(new Error('pg: query failed'));
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'tok' });
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body.error).toBe('Internal server error');
  });
});

// ─── A07: Authentication — token replay / re-use attacks ─────────────────────

describe('A07 — Authentication: token replay and re-use attacks', () => {
  test('previously revoked refresh token returns 401', async () => {
    RefreshToken.findOne.mockResolvedValue({
      revoked_at: new Date(Date.now() - 1000), // already revoked
      expires_at: new Date(Date.now() + 60_000),
      update: jest.fn(),
    });
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'already-used-token' });
    expect(res.status).toBe(401);
  });

  test('expired refresh token returns 401', async () => {
    RefreshToken.findOne.mockResolvedValue({
      revoked_at: null,
      expires_at: new Date(Date.now() - 1), // just expired
      update: jest.fn(),
    });
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'expired-token' });
    expect(res.status).toBe(401);
  });

  test('lockout prevents login after MAX_FAILED_ATTEMPTS', async () => {
    const lockedUser = {
      id: 'uid',
      email: 'a@b.com',
      password_hash: 'hash',
      role: 'ADMIN',
      failed_attempts: 5,
      locked_until: new Date(Date.now() + 15 * 60 * 1000),
      update: jest.fn(),
    };
    User.findOne.mockResolvedValue(lockedUser);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'correct-password' });
    // Even if password were correct, locked account must return 403
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/locked/i);
  });
});

// ─── A07: Authentication — malformed / empty inputs ──────────────────────────

describe('A07 — Authentication: malformed input handling', () => {
  test('empty string email returns 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: '', password: 'pw' });
    expect(res.status).toBe(400);
  });

  test('empty string password returns 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: '' });
    expect(res.status).toBe(400);
  });

  test('non-string values in body do not cause 500', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 12345, password: true });
    // Either 400 (validation) or 401 (user not found) — never 500
    expect([400, 401]).toContain(res.status);
    expect(res.body).not.toHaveProperty('stack');
  });

  test('missing body entirely returns 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('');
    expect([400]).toContain(res.status);
  });
});
