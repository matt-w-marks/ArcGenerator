const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Invite = require('../models/Invite');
const authService = require('../services/authService');
const { logEvent } = require('../services/factoryLog');

const router = express.Router();

const VALID_ROLES = ['ADMIN', 'OPERATOR', 'VIEWER'];
const INVITE_EXPIRY_DAYS = 7;

// ── Admin guard — all routes in this file require ADMIN role ─────────────────

function requireAdmin(req, res, next) {
  // x-user-role is injected by the gateway from verified JWT
  const role = req.headers['x-user-role'];
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

router.use(requireAdmin);

// ── GET /auth/users — list all users ─────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'role', 'created_at', 'failed_attempts', 'locked_until'],
      order: [['created_at', 'ASC']],
    });
    return res.json(users);
  } catch (err) {
    return next(err);
  }
});

// ── POST /auth/users — create a user ────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'email, password, and role are required' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const password_hash = await authService.hashPassword(password);
    const user = await User.create({ id: uuidv4(), email, password_hash, role });

    logEvent('INFO', 'user created by admin', { userId: user.id, email, role, createdBy: req.headers['x-user-id'] });

    return res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    });
  } catch (err) {
    return next(err);
  }
});

// ── PUT /auth/users/:id — update user role or email ──────────────────────────

router.put('/:id', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { email, role } = req.body;
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    if (email) user.email = email;
    if (role) user.role = role;
    await user.save();

    logEvent('INFO', 'user updated by admin', { userId: user.id, email: user.email, role: user.role, updatedBy: req.headers['x-user-id'] });

    return res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    });
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /auth/users/:id — delete user ─────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-deletion
    if (user.id === req.headers['x-user-id']) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    logEvent('INFO', 'user deleted by admin', { userId: user.id, email: user.email, deletedBy: req.headers['x-user-id'] });
    await user.destroy();

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

// ── POST /auth/invites — generate invite link ────────────────────────────────

router.post('/invites', async (req, res, next) => {
  try {
    const { role, email } = req.body;
    if (!role) {
      return res.status(400).json({ error: 'role is required' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + INVITE_EXPIRY_DAYS);

    const invite = await Invite.create({
      id: uuidv4(),
      token,
      role,
      email: email || null,
      expires_at,
      created_by: req.headers['x-user-id'] || null,
    });

    logEvent('INFO', 'invite created', { inviteId: invite.id, role, email, createdBy: req.headers['x-user-id'] });

    return res.status(201).json({
      id: invite.id,
      token: invite.token,
      role: invite.role,
      email: invite.email,
      expires_at: invite.expires_at,
    });
  } catch (err) {
    return next(err);
  }
});

// ── GET /auth/invites — list active invites ──────────────────────────────────

router.get('/invites', async (req, res, next) => {
  try {
    const invites = await Invite.findAll({
      order: [['created_at', 'DESC']],
    });
    return res.json(invites);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
