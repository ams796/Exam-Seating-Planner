require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const { requestLogger, securityHeaders, rateLimiter } = require('./middleware/security');
const authRoutes = require('./routes/auth');
const allocationRoutes = require('./routes/allocations');
// Other services plug in here (same pattern):
//   const hallRoutes = require('./routes/halls');   // Hall & Seat Layout Service (Mohamed Rishi)
//   const examRoutes = require('./routes/exams');   // Exam & Enrolment Service (Nour)
const { sql } = require('./services/db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Vercel sits in front of the app: trust its X-Forwarded-For so req.ip is the real client IP
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(requestLogger);
app.use(securityHeaders);

// Lab 5: allowed frontend origins come from .env / Vercel (comma-separated)
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8080')
  .split(',')
  .map((origin) => origin.trim());
app.use(cors({ origin: allowedOrigins }));

// Lab 8: rate limit every API call per client IP (429 when exceeded)
app.use('/api', rateLimiter({ max: Number(process.env.RATE_LIMIT_MAX) || 120, name: 'API' }));

// Parse JSON bodies; small limit so huge requests are rejected
app.use(express.json({ limit: '50kb' }));

app.get('/', (req, res) => {
  res.status(200).json({ name: 'Exam Seating Planner API', health: '/api/health' });
});

// Health check including a database ping (used for monitoring)
app.get('/api/health', async (req, res) => {
  try {
    await sql.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'ok', environment: process.env.NODE_ENV || 'development' });
  } catch (error) {
    console.error(JSON.stringify({ type: 'HEALTH_FAILED', message: error.message }));
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

app.use('/api/auth', authRoutes);
// app.use('/api/halls', hallRoutes);
// app.use('/api/exams', examRoutes);
app.use('/api', allocationRoutes);

// Route not found
app.use((req, res) => {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found.' } });
});

// Central error handler: safe message only, details go to the logs
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON.' } });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
  }
  console.error(JSON.stringify({ type: 'SERVER_ERROR', path: req.path, message: error.message }));
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Exam Seating Planner API listening on http://localhost:${PORT}`);
  });
}

// Vercel turns this exported Express app into one serverless function.
module.exports = app;
