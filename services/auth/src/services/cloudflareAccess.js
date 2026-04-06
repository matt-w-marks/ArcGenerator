const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * Cloudflare Access JWT verification.
 *
 * Cloudflare Access signs every authenticated request with a JWT placed in the
 * `Cf-Access-Jwt-Assertion` header. We verify it against Cloudflare's public
 * keys (JWKS) to defend against forged headers from anyone who bypasses the
 * NSG IP allowlist.
 *
 * Required env vars:
 *   CF_ACCESS_TEAM_DOMAIN — e.g. "yourteam.cloudflareaccess.com"
 *   CF_ACCESS_AUD        — the AUD tag from the Access application settings
 */

const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour
let cachedKeys = null;     // { kid: KeyObject }
let cachedAt = 0;

function teamDomain() {
  const d = process.env.CF_ACCESS_TEAM_DOMAIN;
  if (!d) throw new Error('CF_ACCESS_TEAM_DOMAIN is not set');
  return d.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function audTag() {
  const a = process.env.CF_ACCESS_AUD;
  if (!a) throw new Error('CF_ACCESS_AUD is not set');
  return a;
}

async function fetchJwks() {
  const url = `https://${teamDomain()}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = await res.json();
  const keys = {};
  for (const jwk of body.keys || []) {
    if (!jwk.kid) continue;
    keys[jwk.kid] = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  }
  return keys;
}

async function getKey(kid) {
  if (!cachedKeys || Date.now() - cachedAt > JWKS_TTL_MS || !cachedKeys[kid]) {
    cachedKeys = await fetchJwks();
    cachedAt = Date.now();
  }
  return cachedKeys[kid] || null;
}

/**
 * Verify a Cloudflare Access JWT and return its decoded payload.
 * Throws if signature is invalid, expired, or AUD doesn't match.
 */
async function verifyAccessJwt(token) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw new Error('Malformed Cloudflare Access JWT');
  }
  const key = await getKey(decoded.header.kid);
  if (!key) throw new Error('Unknown signing key');

  return jwt.verify(token, key, {
    algorithms: ['RS256'],
    audience: audTag(),
    issuer: `https://${teamDomain()}`,
  });
}

function _resetCache() {
  cachedKeys = null;
  cachedAt = 0;
}

module.exports = { verifyAccessJwt, _resetCache };
