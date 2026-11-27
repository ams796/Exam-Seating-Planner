// Shared (Auth): password hashing with scrypt, built into Node (same idea as Lab 8).
// Stored format: scrypt$<salt hex>$<hash hex>. The plain password is never stored or logged.
const crypto = require('crypto');

const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  // timingSafeEqual: comparison time does not reveal how many characters matched
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Session tokens: random 32 bytes. Only the SHA-256 hash is kept in the database.
function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = { hashPassword, verifyPassword, newSessionToken, hashToken };
