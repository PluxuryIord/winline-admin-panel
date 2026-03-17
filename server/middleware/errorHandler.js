export default function errorHandler(err, req, res, _next) {
  console.error(`[error] ${req.method} ${req.path}:`, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
}
