// Shared (Auth): who is calling, and are they allowed?
//   requireAuth      -> 401 if there is no valid, unexpired session token
//   requireRole(...) -> 403 if the user's role is not in the list
// The user id and role always come from the database session, never from the request body or URL.
const { sql } = require('../services/db');
const { hashToken } = require('../services/passwords');
const { audit } = require('../services/audit');
const { sendError } = require('../utils/errors');

async function requireAuth(req, res, next) {
  try {
    const header = req.get('Authorization') || '';
    const match = header.match(/^Bearer ([a-f0-9]{64})$/i);
    if (!match) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Please log in first.');
    }

    const rows = await sql.query(
      `SELECT u.id, u.name, u.role, u.email, u.student_code AS "studentCode"
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(match[1])]
    );
    if (rows.length === 0) {
      return sendError(res, 401, 'SESSION_EXPIRED', 'Your session has expired. Please log in again.');
    }

    req.user = rows[0];
    req.tokenHash = hashToken(match[1]);
    next();
  } catch (error) {
    next(error);
  }
}

function requireRole(...roles) {
  return async (req, res, next) => {
    if (roles.includes(req.user.role)) return next();
    await audit(req, 'ACCESS_DENIED', `${req.method} ${req.originalUrl}`, 'denied');
    return sendError(res, 403, 'FORBIDDEN', 'You do not have permission to do this.');
  };
}

module.exports = { requireAuth, requireRole };
