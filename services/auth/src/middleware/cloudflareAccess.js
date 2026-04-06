const { verifyAccessJwt } = require('../services/cloudflareAccess');
const { logEvent } = require('../services/factoryLog');

/**
 * Express middleware that verifies the Cf-Access-Jwt-Assertion header if
 * present. On success, attaches `req.cfAccess = { email, sub }`. If absent,
 * passes through (the password fallback path still works). If present but
 * invalid, returns 401 — this is defense behind the NSG IP allowlist against
 * forged headers.
 */
async function cloudflareAccessMiddleware(req, res, next) {
  const token = req.headers['cf-access-jwt-assertion'];
  if (!token) return next();

  try {
    const payload = await verifyAccessJwt(token);
    req.cfAccess = {
      email: payload.email || payload.identity_nonce || null,
      sub: payload.sub,
    };
    return next();
  } catch (err) {
    logEvent('WARN', 'cloudflare access jwt verify failed', { error: err.message });
    return res.status(401).json({ error: 'Invalid Cloudflare Access token' });
  }
}

module.exports = cloudflareAccessMiddleware;
