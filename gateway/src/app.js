const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const authenticate = require('./middleware/authenticate');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── Body parsing (1 MB limit) ─────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Strip client-supplied identity headers (prevent spoofing) ────────────────
app.use((_req, res, next) => {
  // These headers are gateway-owned — clients must never set them
  delete _req.headers['x-user-id'];
  delete _req.headers['x-user-role'];
  next();
});

// ── Global rate limit: 200 req / 15 min per IP ───────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Skip rate limiting during test runs (jest sets JEST_WORKER_ID automatically)
if (!process.env.JEST_WORKER_ID) {
  app.use(globalLimiter);
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gateway' });
});

// ── Proxy helpers ─────────────────────────────────────────────────────────────

/**
 * Inject verified user identity as headers for downstream services.
 * Only called after authenticate middleware has populated req.user.
 */
function injectUserHeaders(proxyReq, req) {
  if (req.user) {
    proxyReq.setHeader('x-user-id', req.user.id);
    proxyReq.setHeader('x-user-role', req.user.role);
  }
}

// ── /auth — no authentication required (auth service handles its own flows) ──
//
// Auth service routes use /auth/* prefix, so we need to re-add it after
// Express strips the mount prefix.
app.use(
  '/auth',
  createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL || 'http://auth:3001',
    changeOrigin: true,
    pathRewrite: (path) => `/auth${path}`,
    on: { proxyReq: fixRequestBody },
  })
);

// ── /metrics — JWT required ───────────────────────────────────────────────────
app.use(
  '/metrics',
  authenticate,
  createProxyMiddleware({
    target: process.env.METRICS_SERVICE_URL || 'http://metrics:8000',
    changeOrigin: true,
    on: { proxyReq: (proxyReq, req) => { injectUserHeaders(proxyReq, req); fixRequestBody(proxyReq, req); } },
  })
);

// ── /export — JWT required ────────────────────────────────────────────────────
app.use(
  '/export',
  authenticate,
  createProxyMiddleware({
    target: process.env.EXPORT_SERVICE_URL || 'http://export:8001',
    changeOrigin: true,
    on: { proxyReq: (proxyReq, req) => { injectUserHeaders(proxyReq, req); fixRequestBody(proxyReq, req); } },
  })
);

app.use(errorHandler);

module.exports = app;
