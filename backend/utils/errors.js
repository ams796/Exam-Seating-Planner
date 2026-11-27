// Shared: every error answer has the same shape { error: { code, message } } (same as Lab 4/5).
function sendError(res, status, code, message, details) {
  const body = { error: { code, message } };
  if (details) body.error.details = details;
  return res.status(status).json(body);
}

// A positive whole number from a URL or body value, or null.
function toId(value) {
  const text = String(value ?? '');
  if (!/^[1-9][0-9]{0,8}$/.test(text)) return null;
  return Number(text);
}

module.exports = { sendError, toId };
