const jwt = require('jsonwebtoken');
const authenticate = require('../../src/middleware/authenticate');

const SECRET = 'test-secret-32-chars-long-xxxxxxx';

function makeReq(authHeader) {
  return { headers: { authorization: authHeader } };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

describe('authenticate middleware', () => {
  test('401 when Authorization header is absent', () => {
    const req = makeReq(undefined);
    const res = makeRes();
    authenticate(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/missing|invalid/i) })
    );
  });

  test('401 when Authorization header does not start with Bearer', () => {
    const req = makeReq('Basic abc123');
    const res = makeRes();
    authenticate(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('401 when token is invalid', () => {
    const req = makeReq('Bearer not.a.real.token');
    const res = makeRes();
    authenticate(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  test('401 when token is signed with wrong secret', () => {
    const token = jwt.sign({ sub: 'uid', role: 'ADMIN' }, 'wrong-secret');
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    authenticate(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('401 when token is expired', () => {
    const token = jwt.sign({ sub: 'uid', role: 'ADMIN' }, SECRET, { expiresIn: '-1s' });
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    authenticate(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('calls next() and sets req.user on valid token', () => {
    const token = jwt.sign({ sub: 'uid-123', role: 'ADMIN' }, SECRET, { expiresIn: '15m' });
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = jest.fn();
    authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'uid-123', role: 'ADMIN' });
  });

  test('does not call next() on invalid token', () => {
    const req = makeReq('Bearer bad');
    const res = makeRes();
    const next = jest.fn();
    authenticate(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});
