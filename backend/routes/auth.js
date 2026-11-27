// Shared (Auth): log in, log out, who am I.
const express = require('express');
const { sql } = require('../services/db');
const { verifyPassword, newSessionToken, hashToken } = require('../services/passwords');
const { audit } = require('../services/audit');
const { requireAuth } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/security');
const { sendError } = require('../utils/errors');

const router = express.Router();
const SESSION_HOURS = 2;

// Stricter limit on login to slow down password guessing.
const loginLimiter = rateLimiter({ max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10, name: 'LOGIN' });

// POST /api/auth/login  { login: email or student code, password }
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.');
    }
    const { login, password } = req.body || {};
    if (typeof login !== 'string' || typeof password !== 'string' ||
        login.trim().length < 3 || login.length > 100 || password.length < 1 || password.length > 200) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Login and password are required.');
    }

    const rows = await sql.query(
      `SELECT id, name, role, password_hash FROM users
       WHERE lower(email) = lower($1) OR upper(student_code) = upper($1)`,
      [login.trim()]
    );
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      // Same message whether the account exists or not.
      await audit(req, 'LOGIN_FAILED', login.trim().slice(0, 60), 'failed');
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid login or password.');
    }

    const token = newSessionToken();
    await sql.query(
      `INSERT INTO sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + make_interval(hours => $3))`,
      [hashToken(token), user.id, SESSION_HOURS]
    );
    req.user = { id: user.id, role: user.role };
    await audit(req, 'LOGIN_SUCCESS', null, 'success');

    res.status(200).json({
      token,
      expiresInHours: SESSION_HOURS,
      user: { id: user.id, name: user.name, role: user.role }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout  -> deletes this session
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await sql.query('DELETE FROM sessions WHERE token_hash = $1', [req.tokenHash]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me  -> the logged-in user (used to build the menu)
router.get('/me', requireAuth, (req, res) => {
  res.status(200).json(req.user);
});

module.exports = router;
