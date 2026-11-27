// Shared (Logging): one audit line per security or change event.
// Written to the console (shows in Vercel Runtime Logs) AND to the audit_logs table (queryable).
// Never pass passwords, tokens or keys in "target".
const { sql } = require('./db');

async function audit(req, action, target, outcome) {
  const entry = {
    type: 'AUDIT',
    at: new Date().toISOString(),
    action,
    outcome,
    target: target == null ? null : String(target),
    userId: req.user ? req.user.id : null,
    role: req.user ? req.user.role : null,
    ip: req.ip || null
  };
  console.log(JSON.stringify(entry));
  try {
    await sql.query(
      `INSERT INTO audit_logs (user_id, role, action, target, outcome, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.userId, entry.role, action, entry.target, outcome, entry.ip]
    );
  } catch (error) {
    // Logging must never break the request itself.
    console.error(JSON.stringify({ type: 'AUDIT_WRITE_FAILED', action, message: error.message }));
  }
}

module.exports = { audit };
