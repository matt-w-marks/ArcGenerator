/**
 * Writes security events to factory_logs.flg_entries.
 * Uses the `pg` module directly with a parameterized query — no raw SQL strings
 * are constructed from user input; all values flow through pg's parameter binding.
 * Failures are always suppressed: logging must never break the auth service.
 */
const { Pool } = require('pg');

const LOGGING_URL = process.env.LOGGING_DATABASE_URL || '';
let pool = null;

function getPool() {
  if (!pool && LOGGING_URL) {
    pool = new Pool({ connectionString: LOGGING_URL });
  }
  return pool;
}

/**
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {string} message
 * @param {object|null} context
 */
async function logEvent(level, message, context = null) {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(
      'INSERT INTO factory_logs.flg_entries (app_label, level, message, context) VALUES ($1, $2, $3, $4)',
      ['auth', level.toUpperCase(), message, context ? JSON.stringify(context) : null]
    );
  } catch {
    // Logging failures must not propagate
  }
}

module.exports = { logEvent };
