// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  console.error('[auth] unhandled error:', err.message);
  // Never expose stack traces or internal details to clients
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
