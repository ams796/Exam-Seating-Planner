// Shared: one Neon connection for the whole API (Lab 5 driver: @neondatabase/serverless).
// DATABASE_URL comes from .env locally and from Vercel Environment Variables in the cloud.
const { neon } = require('@neondatabase/serverless');

const databaseUrl = (process.env.DATABASE_URL || '').trim();

function notConfigured() {
  throw new Error('DATABASE_URL is not set. Add it to backend/.env (local) or Vercel > Settings > Environment Variables.');
}

// sql.query(text, params) runs one parameterised query and returns the rows.
// sql.transaction([...queries]) runs several queries as ONE transaction (all or nothing).
// Values are always passed as $1, $2 ... parameters, never glued into the SQL text,
// so user input cannot change the query (no SQL injection).
const sql = databaseUrl
  ? neon(databaseUrl)
  : { query: notConfigured, transaction: notConfigured };

module.exports = { sql };
