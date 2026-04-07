const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const errorHandler = require('./middleware/errorHandler');
const cloudflareAccess = require('./middleware/cloudflareAccess');

const app = express();

// Trust the immediate upstream proxy (gateway) so express-rate-limit and
// req.ip work correctly with X-Forwarded-For headers from the gateway.
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Skip rate limiting during test runs (jest sets JEST_WORKER_ID automatically)
if (!process.env.JEST_WORKER_ID) {
  app.use('/auth', authLimiter);
}
app.use(cloudflareAccess);
app.use('/auth', authRoutes);
app.use('/auth/users', usersRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth' });
});

app.use(errorHandler);

module.exports = app;
