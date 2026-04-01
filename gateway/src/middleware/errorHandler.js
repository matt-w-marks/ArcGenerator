function errorHandler(err, req, res, _next) {
  console.error('[gateway] unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
