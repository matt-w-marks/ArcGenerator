const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PasswordHistory = require('../models/PasswordHistory');
const { logEvent } = require('./factoryLog');

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;
const HISTORY_DEPTH = 5;
const HIBP_URL = 'https://api.pwnedpasswords.com/range/';

function validateLength(password) {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters`;
  if (password.length > MAX_LENGTH) return `Password must be at most ${MAX_LENGTH} characters`;
  return null;
}

/**
 * Check HaveIBeenPwned via k-anonymity range API.
 * Only the first 5 chars of the SHA-1 are sent. Fail-open on network error.
 */
async function checkBreached(password) {
  try {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const res = await fetch(`${HIBP_URL}${prefix}`, {
      headers: { 'User-Agent': 'ArcGenerator-Auth/1.0', 'Add-Padding': 'true' },
    });
    if (!res.ok) {
      logEvent('WARN', 'HIBP check failed — fail-open', { status: res.status });
      return false;
    }
    const text = await res.text();
    const lines = text.split('\n');
    for (const line of lines) {
      const [hashSuffix] = line.split(':');
      if (hashSuffix && hashSuffix.trim().toUpperCase() === suffix) return true;
    }
    return false;
  } catch (err) {
    logEvent('WARN', 'HIBP check error — fail-open', { error: err.message });
    return false;
  }
}

async function checkHistory(userId, plaintext) {
  if (!userId) return false;
  const rows = await PasswordHistory.findAll({
    where: { user_id: userId },
    order: [['changed_at', 'DESC']],
    limit: HISTORY_DEPTH,
  });
  for (const row of rows) {
    if (await bcrypt.compare(plaintext, row.password_hash)) return true;
  }
  return false;
}

async function validatePolicy(password, userId) {
  const errors = [];
  const lenErr = validateLength(password);
  if (lenErr) errors.push(lenErr);

  if (errors.length === 0) {
    if (await checkBreached(password)) {
      errors.push('This password has been seen in data breaches. Choose another.');
    }
    if (userId && (await checkHistory(userId, password))) {
      errors.push(`Password cannot match any of your last ${HISTORY_DEPTH} passwords.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

async function recordHistory(userId, passwordHash) {
  await PasswordHistory.create({ user_id: userId, password_hash: passwordHash });
  // Trim to most recent HISTORY_DEPTH entries
  const all = await PasswordHistory.findAll({
    where: { user_id: userId },
    order: [['changed_at', 'DESC']],
    attributes: ['id'],
  });
  if (all.length > HISTORY_DEPTH) {
    const stale = all.slice(HISTORY_DEPTH).map((r) => r.id);
    await PasswordHistory.destroy({ where: { id: stale } });
  }
}

module.exports = {
  MIN_LENGTH,
  MAX_LENGTH,
  HISTORY_DEPTH,
  validateLength,
  checkBreached,
  checkHistory,
  validatePolicy,
  recordHistory,
};
