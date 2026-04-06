export default function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  console.error(`[error] ${req.method} ${req.path}:`, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  // Never expose internal error details to client on 500
  const message = status >= 500 ? 'Внутренняя ошибка сервера' : (err.message || 'Ошибка');
  res.status(status).json({ error: message });
}
