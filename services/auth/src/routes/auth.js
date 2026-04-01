const express = require('express');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const authService = require('../services/authService');
const { logEvent } = require('../services/factoryLog');

const router = express.Router();

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      logEvent('WARN', 'login failed — user not found', { email });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (authService.isAccountLocked(user)) {
      logEvent('WARN', 'login rejected — account locked', { userId: user.id });
      return res.status(403).json({ error: 'Account is locked. Try again later.' });
    }

    const valid = await authService.comparePassword(password, user.password_hash);
    if (!valid) {
      const newAttempts = user.failed_attempts + 1;
      const update = { failed_attempts: newAttempts };
      if (newAttempts >= authService.MAX_FAILED_ATTEMPTS) {
        update.locked_until = authService.getLockoutUntil();
        logEvent('WARN', 'account locked after repeated failures', { userId: user.id, attempts: newAttempts });
      } else {
        logEvent('WARN', 'login failed — wrong password', { userId: user.id, attempts: newAttempts });
      }
      await user.update(update);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await user.update({ failed_attempts: 0, locked_until: null });
    logEvent('INFO', 'login successful', { userId: user.id });

    const accessToken = authService.generateAccessToken(user.id, user.role);
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

    const accessToken = authService.generateAccessToken(user.id, user.role);
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

module.exports = router;
