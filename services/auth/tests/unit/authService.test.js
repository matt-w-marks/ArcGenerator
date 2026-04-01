jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('uuid');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Load authService after mocks are in place
const authService = require('../../src/services/authService');

beforeEach(() => jest.clearAllMocks());

describe('hashPassword', () => {
  test('delegates to bcrypt.hash with 12 rounds', async () => {
    bcrypt.hash.mockResolvedValue('$hashed');
    const result = await authService.hashPassword('mysecret');
    expect(bcrypt.hash).toHaveBeenCalledWith('mysecret', 12);
    expect(result).toBe('$hashed');
  });
});

describe('comparePassword', () => {
  test('returns true when password matches hash', async () => {
    bcrypt.compare.mockResolvedValue(true);
    expect(await authService.comparePassword('pw', '$hash')).toBe(true);
  });

  test('returns false when password does not match', async () => {
    bcrypt.compare.mockResolvedValue(false);
    expect(await authService.comparePassword('wrong', '$hash')).toBe(false);
  });
});

describe('generateAccessToken', () => {
  test('signs JWT with sub, role, and 15m expiry', () => {
    process.env.JWT_SECRET = 'test-secret';
    jwt.sign.mockReturnValue('signed-token');

    const token = authService.generateAccessToken('uid-1', 'ADMIN');

    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: 'uid-1', role: 'ADMIN' },
      'test-secret',
      { expiresIn: '15m' }
    );
    expect(token).toBe('signed-token');
  });
});

describe('verifyAccessToken', () => {
  test('verifies token using JWT_SECRET', () => {
    process.env.JWT_SECRET = 'test-secret';
    jwt.verify.mockReturnValue({ sub: 'uid-1', role: 'ADMIN' });

    const payload = authService.verifyAccessToken('a.b.c');

    expect(jwt.verify).toHaveBeenCalledWith('a.b.c', 'test-secret');
    expect(payload).toEqual({ sub: 'uid-1', role: 'ADMIN' });
  });

  test('propagates JsonWebTokenError when token is invalid', () => {
    const err = new Error('invalid');
    err.name = 'JsonWebTokenError';
    jwt.verify.mockImplementation(() => { throw err; });
    expect(() => authService.verifyAccessToken('bad')).toThrow('invalid');
  });
});

describe('generateRefreshTokenValue', () => {
  test('returns a uuid', () => {
    uuidv4.mockReturnValue('test-uuid-value');
    expect(authService.generateRefreshTokenValue()).toBe('test-uuid-value');
  });
});

describe('hashToken', () => {
  test('returns a 64-char hex string', () => {
    expect(authService.hashToken('any-token')).toMatch(/^[a-f0-9]{64}$/);
  });

  test('is deterministic — same input yields same output', () => {
    expect(authService.hashToken('tok')).toBe(authService.hashToken('tok'));
  });

  test('different inputs yield different outputs', () => {
    expect(authService.hashToken('a')).not.toBe(authService.hashToken('b'));
  });
});

describe('getRefreshTokenExpiry', () => {
  test('returns a date 7 days in the future', () => {
    const before = Date.now();
    const expiry = authService.getRefreshTokenExpiry();
    const after = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + sevenDays - 100);
    expect(expiry.getTime()).toBeLessThanOrEqual(after + sevenDays + 100);
  });
});

describe('isAccountLocked', () => {
  test('returns false when locked_until is null', () => {
    expect(authService.isAccountLocked({ locked_until: null })).toBe(false);
  });

  test('returns true when locked_until is in the future', () => {
    const future = new Date(Date.now() + 60_000);
    expect(authService.isAccountLocked({ locked_until: future })).toBe(true);
  });

  test('returns false when locked_until is in the past', () => {
    const past = new Date(Date.now() - 60_000);
    expect(authService.isAccountLocked({ locked_until: past })).toBe(false);
  });
});

describe('getLockoutUntil', () => {
  test('returns a date 15 minutes in the future', () => {
    const before = Date.now();
    const lockout = authService.getLockoutUntil();
    const after = Date.now();
    const fifteenMin = 15 * 60 * 1000;
    expect(lockout.getTime()).toBeGreaterThanOrEqual(before + fifteenMin - 100);
    expect(lockout.getTime()).toBeLessThanOrEqual(after + fifteenMin + 100);
  });
});

describe('MAX_FAILED_ATTEMPTS', () => {
  test('is 5', () => {
    expect(authService.MAX_FAILED_ATTEMPTS).toBe(5);
  });
});
