function errorHandler(err, req, res, _next) {
  console.error('[gateway] unhandled error:', err.message);
  // Preserve well-known HTTP status codes (e.g. 413 PayloadTooLarge from body-parser)
  // but never expose internal details — generic message only.
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
