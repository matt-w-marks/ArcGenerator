const { Op } = require('sequelize');
const LoginAttempt = require('../models/LoginAttempt');

const WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILURES = 5;

function windowStart() {
  return new Date(Date.now() - WINDOW_MS);
}

async function recordAttempt({ email, userId = null, ip = null, succeeded }) {
  await LoginAttempt.create({
    email,
    user_id: userId,
    ip_address: ip,
    succeeded,
    attempted_at: new Date(),
  });
}

async function getRecentFailureCount(email) {
  return LoginAttempt.count({
    where: {
      email,
      succeeded: false,
      attempted_at: { [Op.gte]: windowStart() },
    },
  });
}

async function clearFailures(email, userId) {
  const where = { succeeded: false };
  if (userId) {
    where[Op.or] = [{ user_id: userId }, { email }];
  } else {
    where.email = email;
  }
  await LoginAttempt.destroy({ where });
}

/**
 * Seconds until the OLDEST failure in the current window ages out,
 * which is when the count drops below MAX_FAILURES (assuming exactly
 * MAX_FAILURES failures exist in the window). Returns >=1.
 */
async function getRetryAfterSeconds(email) {
  const oldest = await LoginAttempt.findOne({
    where: {
      email,
      succeeded: false,
      attempted_at: { [Op.gte]: windowStart() },
    },
    order: [['attempted_at', 'ASC']],
  });
  if (!oldest) return 0;
  const ageOutAt = new Date(new Date(oldest.attempted_at).getTime() + WINDOW_MS);
  const seconds = Math.ceil((ageOutAt.getTime() - Date.now()) / 1000);
  return Math.max(1, seconds);
}

module.exports = {
  WINDOW_MS,
  MAX_FAILURES,
  recordAttempt,
  getRecentFailureCount,
  clearFailures,
  getRetryAfterSeconds,
};
