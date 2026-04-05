const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Skip rate limiting during test runs (jest sets JEST_WORKER_ID automatically)
if (!process.env.JEST_WORKER_ID) {
  app.use('/auth', authLimiter);
}
app.use('/auth', authRoutes);
app.use('/auth/users', usersRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth' });
});

app.use(errorHandler);

module.exports = app;
