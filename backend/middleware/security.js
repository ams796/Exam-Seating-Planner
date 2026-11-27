// Shared (Security): Lab 8 "security in layers", adapted to our Express API on Vercel.
const { audit } = require('../services/audit');
const { sendError } = require('../utils/errors');

// 1. Request log: one JSON line per request (Vercel Runtime Logs).
//    Never logs bodies, passwords or tokens.
function requestLogger(req, res, next) {
  const started = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      type: 'REQUEST',
      at: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Date.now() - started,
      userId: req.user ? req.user.id : null,
      role: req.user ? req.user.role : null
    }));
  });
  next();
}

// 2. Security headers on every API answer (same list as Lab 8 + Lab 5 vercel.json).
function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  });
  next();
}

// 3. Rate limiter, sliding window per client IP (Lab 8 idea).
//    Over the limit -> 429. Counts live in memory, so on Vercel each running instance
//    counts separately (a known limitation, same as the Lab 8 note about several workers).
function rateLimiter({ max, windowMs = 60_000, name = 'API' }) {
  const hits = new Map(); // ip -> array of request times
  return async (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const recent = (hits.get(key) || []).filter((time) => now - time < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      await audit(req, 'RATE_LIMITED', `${name} ${req.method} ${req.path}`, 'denied');
      return sendError(res, 429, 'TOO_MANY_REQUESTS', 'Too many requests. Please wait a minute and try again.');
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear(); // keep memory small
    next();
  };
}

module.exports = { requestLogger, securityHeaders, rateLimiter };
