/**
 * Integration tests for auth routes.
 * Models and DB are mocked — tests focus on route logic and HTTP contract.
 */

// Mock DB/model dependencies before any app code is loaded
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

const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const RefreshToken = require('../../src/models/RefreshToken');
const authService = require('../../src/services/authService');

beforeEach(() => jest.clearAllMocks());

// ─── /health ────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns 200 with service name', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'auth' });
  });
});

// ─── POST /auth/login ────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  test('400 when email is missing', async () => {
    const res = await request(app).post('/auth/login').send({ password: 'pw' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('400 when password is missing', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  test('401 when user not found', async () => {
    User.findOne.mockResolvedValue(null);
    const res = await request(app).post('/auth/login').send({ email: 'x@x.com', password: 'pw' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('403 when account is locked', async () => {
    const lockedUntil = new Date(Date.now() + 60_000);
    User.findOne.mockResolvedValue({
      id: 'uid',
      email: 'a@b.com',
      password_hash: 'hash',
      role: 'ADMIN',
      failed_attempts: 5,
      locked_until: lockedUntil,
      update: jest.fn(),
    });
    const res = await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'bad' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/locked/i);
  });

  test('401 and increments failed_attempts on wrong password', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    User.findOne.mockResolvedValue({
      id: 'uid',
      email: 'a@b.com',
      password_hash: 'hash',
      role: 'ADMIN',
      failed_attempts: 1,
      locked_until: null,
      update: updateMock,
    });
    jest.spyOn(authService, 'comparePassword').mockResolvedValue(false);

    const res = await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ failed_attempts: 2 }));
  });

  test('401 and sets locked_until after 5th failed attempt', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    User.findOne.mockResolvedValue({
      id: 'uid',
      email: 'a@b.com',
      password_hash: 'hash',
      role: 'ADMIN',
      failed_attempts: 4,
      locked_until: null,
      update: updateMock,
    });
    jest.spyOn(authService, 'comparePassword').mockResolvedValue(false);

    await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'wrong' });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ failed_attempts: 5, locked_until: expect.any(Date) })
    );
  });

  test('200 with tokens on valid credentials', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const updateMock = jest.fn().mockResolvedValue(undefined);
    User.findOne.mockResolvedValue({
      id: 'uid-123',
      email: 'admin@test.com',
      password_hash: 'hash',
      role: 'ADMIN',
      failed_attempts: 0,
      locked_until: null,
      update: updateMock,
    });
    jest.spyOn(authService, 'comparePassword').mockResolvedValue(true);
    RefreshToken.create.mockResolvedValue({});

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'correct' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(updateMock).toHaveBeenCalledWith({ failed_attempts: 0, locked_until: null });
  });

  test('500 on unexpected DB error', async () => {
    User.findOne.mockRejectedValue(new Error('db boom'));
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@b.com', password: 'pw' });
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('stack');
  });
});

// ─── POST /auth/refresh ──────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  test('400 when refreshToken is missing', async () => {
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  test('401 when token not found in DB', async () => {
    RefreshToken.findOne.mockResolvedValue(null);
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'bad' });
    expect(res.status).toBe(401);
  });

  test('401 when token is revoked', async () => {
    RefreshToken.findOne.mockResolvedValue({
      revoked_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
      update: jest.fn(),
    });
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'revoked' });
    expect(res.status).toBe(401);
  });

  test('401 when token is expired', async () => {
    RefreshToken.findOne.mockResolvedValue({
      revoked_at: null,
      expires_at: new Date(Date.now() - 60_000),
      update: jest.fn(),
    });
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'expired' });
    expect(res.status).toBe(401);
  });

  test('200 with new tokens on valid refresh', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const updateMock = jest.fn().mockResolvedValue(undefined);
    RefreshToken.findOne.mockResolvedValue({
      user_id: 'uid-123',
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000 * 60),
      update: updateMock,
    });
    User.findByPk.mockResolvedValue({ id: 'uid-123', role: 'ADMIN' });
    RefreshToken.create.mockResolvedValue({});

    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'valid-token' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(updateMock).toHaveBeenCalledWith({ revoked_at: expect.any(Date) });
  });

  test('401 when user not found after token lookup', async () => {
    RefreshToken.findOne.mockResolvedValue({
      user_id: 'uid-ghost',
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000),
      update: jest.fn().mockResolvedValue(undefined),
    });
    User.findByPk.mockResolvedValue(null);

    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'orphan' });
    expect(res.status).toBe(401);
  });
});

// ─── POST /auth/logout ───────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  test('400 when refreshToken is missing', async () => {
    const res = await request(app).post('/auth/logout').send({});
    expect(res.status).toBe(400);
  });

  test('200 and revokes existing token', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    RefreshToken.findOne.mockResolvedValue({ revoked_at: null, update: updateMock });

    const res = await request(app).post('/auth/logout').send({ refreshToken: 'token' });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ revoked_at: expect.any(Date) });
  });

  test('200 silently when token is not found', async () => {
    RefreshToken.findOne.mockResolvedValue(null);
    const res = await request(app).post('/auth/logout').send({ refreshToken: 'unknown' });
    expect(res.status).toBe(200);
  });

  test('200 silently when token is already revoked', async () => {
    RefreshToken.findOne.mockResolvedValue({ revoked_at: new Date(), update: jest.fn() });
    const res = await request(app).post('/auth/logout').send({ refreshToken: 'already-revoked' });
    expect(res.status).toBe(200);
  });
});

// ─── GET /auth/verify ────────────────────────────────────────────────────────

describe('GET /auth/verify', () => {
  test('401 when Authorization header is missing', async () => {
    const res = await request(app).get('/auth/verify');
    expect(res.status).toBe(401);
  });

  test('401 when header does not start with Bearer', async () => {
    const res = await request(app).get('/auth/verify').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
  });

  test('401 on invalid JWT', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const res = await request(app).get('/auth/verify').set('Authorization', 'Bearer bad.token');
    expect(res.status).toBe(401);
  });

  test('200 with payload on valid JWT', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const token = authService.generateAccessToken('uid-1', 'ADMIN');
    const res = await request(app).get('/auth/verify').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valid: true, sub: 'uid-1', role: 'ADMIN' });
  });
});
