const express = require('express');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Invite = require('../models/Invite');
const RefreshToken = require('../models/RefreshToken');
const authService = require('../services/authService');
const passwordPolicy = require('../services/passwordPolicy');
const loginRateLimit = require('../services/loginRateLimit');
const { logEvent } = require('../services/factoryLog');

const PASSWORD_CHANGE_COOLDOWN_MS = 5 * 60 * 1000;

const router = express.Router();

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Rolling-window lockout check — rejected attempts do NOT count
    const failureCount = await loginRateLimit.getRecentFailureCount(email);
    if (failureCount >= loginRateLimit.MAX_FAILURES) {
      const retryAfter = await loginRateLimit.getRetryAfterSeconds(email);
      logEvent('WARN', 'login rejected — rate limited', { email, retryAfter });
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too many failed login attempts. Please try again later.',
        retryAfter,
      });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      logEvent('WARN', 'login failed — user not found', { email });
      await loginRateLimit.recordAttempt({ email, ip, succeeded: false });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.password_hash) {
      logEvent('WARN', 'login failed — no password set (sso-only user)', { userId: user.id });
      await loginRateLimit.recordAttempt({ email, userId: user.id, ip, succeeded: false });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await authService.comparePassword(password, user.password_hash);
    if (!valid) {
      logEvent('WARN', 'login failed — wrong password', { userId: user.id });
      await loginRateLimit.recordAttempt({ email, userId: user.id, ip, succeeded: false });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await loginRateLimit.recordAttempt({ email, userId: user.id, ip, succeeded: true });
    await loginRateLimit.clearFailures(email, user.id);
    logEvent('INFO', 'login successful', { userId: user.id });

    const accessToken = authService.generateAccessToken(user.id, user.role, user.first_name, user.last_name);
    const refreshTokenValue = authService.generateRefreshTokenValue();

    await RefreshToken.create({
      id: uuidv4(),
      user_id: user.id,
      token_hash: authService.hashToken(refreshTokenValue),
      expires_at: authService.getRefreshTokenExpiry(),
    });

    return res.json({ accessToken, refreshToken: refreshTokenValue });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const tokenHash = authService.hashToken(refreshToken);
    const stored = await RefreshToken.findOne({ where: { token_hash: tokenHash } });

    if (!stored || stored.revoked_at || new Date(stored.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    await stored.update({ revoked_at: new Date() });

    const user = await User.findByPk(stored.user_id);
    if (!user) {
      logEvent('WARN', 'token refresh failed — user not found', { userId: stored.user_id });
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    logEvent('INFO', 'token refreshed', { userId: user.id });

    const accessToken = authService.generateAccessToken(user.id, user.role, user.first_name, user.last_name);
    const newRefreshTokenValue = authService.generateRefreshTokenValue();

    await RefreshToken.create({
      id: uuidv4(),
      user_id: user.id,
      token_hash: authService.hashToken(newRefreshTokenValue),
      expires_at: authService.getRefreshTokenExpiry(),
    });

    return res.json({ accessToken, refreshToken: newRefreshTokenValue });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const tokenHash = authService.hashToken(refreshToken);
    const stored = await RefreshToken.findOne({ where: { token_hash: tokenHash } });
    if (stored && !stored.revoked_at) {
      await stored.update({ revoked_at: new Date() });
    }

    return res.json({ message: 'Logged out' });
  } catch (err) {
    return next(err);
  }
});

// PUT /auth/profile — update own profile (name, phone, email)
router.put('/profile', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { first_name, last_name, phone, email } = req.body;
    if (first_name !== undefined) user.first_name = first_name;
    if (last_name !== undefined) user.last_name = last_name;
    if (phone !== undefined) user.phone = phone;
    if (email !== undefined && email !== user.email) {
      // Check if email is already taken
      const existing = await User.findOne({ where: { email } });
      if (existing && existing.id !== user.id) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      user.email = email;
    }
    await user.save();
    return res.json({
      id: user.id, email: user.email, role: user.role,
      first_name: user.first_name, last_name: user.last_name, phone: user.phone,
    });
  } catch (err) {
    return next(err);
  }
});

// PUT /auth/profile/password — change own password (requires current password)
router.put('/profile/password', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    // Cooldown check
    if (user.password_changed_at) {
      const elapsed = Date.now() - new Date(user.password_changed_at).getTime();
      if (elapsed < PASSWORD_CHANGE_COOLDOWN_MS) {
        const retryAfter = Math.ceil((PASSWORD_CHANGE_COOLDOWN_MS - elapsed) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
          error: 'Password was changed recently. Please wait before changing again.',
          retryAfter,
        });
      }
    }

    const valid = await authService.comparePassword(current_password, user.password_hash);
    if (!valid) {
      logEvent('WARN', 'password change failed — wrong current password', { userId: user.id });
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // OWASP policy validation
    const policy = await passwordPolicy.validatePolicy(new_password, user.id);
    if (!policy.valid) {
      return res.status(400).json({ error: policy.errors[0], errors: policy.errors });
    }

    const newHash = await authService.hashPassword(new_password);
    user.password_hash = newHash;
    user.password_changed_at = new Date();
    await user.save();
    await passwordPolicy.recordHistory(user.id, newHash);
    logEvent('INFO', 'password changed', { userId: user.id });
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

// PUT /auth/profile/password/initial — set first password for SSO-created user
router.put('/profile/password/initial', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.password_hash) {
      return res.status(409).json({ error: 'Password already set. Use the change password endpoint.' });
    }
    const { new_password } = req.body;
    if (!new_password) return res.status(400).json({ error: 'new_password is required' });

    const policy = await passwordPolicy.validatePolicy(new_password, user.id);
    if (!policy.valid) {
      return res.status(400).json({ error: policy.errors[0], errors: policy.errors });
    }

    const newHash = await authService.hashPassword(new_password);
    user.password_hash = newHash;
    user.password_changed_at = new Date();
    await user.save();
    await passwordPolicy.recordHistory(user.id, newHash);
    logEvent('INFO', 'initial password set', { userId: user.id });
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/sso/bootstrap — exchange Cloudflare Access JWT for our access+refresh tokens
router.post('/sso/bootstrap', async (req, res, next) => {
  try {
    if (!req.cfAccess || !req.cfAccess.email) {
      return res.status(401).json({ error: 'No Cloudflare Access identity present' });
    }
    const email = req.cfAccess.email;
    const user = await User.findOne({ where: { email } });
    if (!user) {
      logEvent('WARN', 'sso login rejected — user not provisioned', { email });
      return res.status(403).json({ error: 'Not authorized. Ask an admin for access.' });
    }

    logEvent('INFO', 'sso login successful', { userId: user.id, email });

    const accessToken = authService.generateAccessToken(
      user.id, user.role, user.first_name, user.last_name
    );
    const refreshTokenValue = authService.generateRefreshTokenValue();

    await RefreshToken.create({
      id: uuidv4(),
      user_id: user.id,
      token_hash: authService.hashToken(refreshTokenValue),
      expires_at: authService.getRefreshTokenExpiry(),
    });

    return res.json({ accessToken, refreshToken: refreshTokenValue });
  } catch (err) {
    return next(err);
  }
});

// GET /auth/profile — get own profile (authenticated)
router.get('/profile', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({
      id: user.id, email: user.email, role: user.role,
      first_name: user.first_name, last_name: user.last_name, phone: user.phone,
      has_password: !!user.password_hash,
    });
  } catch (err) {
    return next(err);
  }
});

// GET /auth/verify — internal endpoint for gateway JWT validation
router.get('/verify', (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.slice(7);
    const payload = authService.verifyAccessToken(token);
    return res.json({ valid: true, sub: payload.sub, role: payload.role });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    return next(err);
  }
});

// GET /auth/invites/:token — validate invite (public, no auth)
router.get('/invites/:token', async (req, res, next) => {
  try {
    const invite = await Invite.findOne({ where: { token: req.params.token } });
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    if (invite.used_at) {
      return res.status(410).json({ error: 'Invite already used' });
    }
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invite expired' });
    }
    return res.json({ role: invite.role, email: invite.email });
  } catch (err) {
    return next(err);
  }
});

// POST /auth/invites/:token/accept — accept invite, create account (public)
router.post('/invites/:token/accept', async (req, res, next) => {
  try {
    const invite = await Invite.findOne({ where: { token: req.params.token } });
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    if (invite.used_at) {
      return res.status(410).json({ error: 'Invite already used' });
    }
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invite expired' });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const policy = await passwordPolicy.validatePolicy(password, null);
    if (!policy.valid) {
      return res.status(400).json({ error: policy.errors[0], errors: policy.errors });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const password_hash = await authService.hashPassword(password);
    const user = await User.create({
      id: uuidv4(),
      email,
      password_hash,
      role: invite.role,
      password_changed_at: new Date(),
    });
    await passwordPolicy.recordHistory(user.id, password_hash);
    await invite.update({ used_at: new Date() });

    logEvent('INFO', 'invite accepted — user created', { userId: user.id, email, role: invite.role, inviteId: invite.id });

    return res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
