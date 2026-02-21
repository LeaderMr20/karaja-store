/**
 * Karaja Island Attendance System — Backend Server
 * Node.js + Express + PostgreSQL
 *
 * Run: npm install && npm start
 * Port: 3000 (or process.env.PORT)
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const authRoutes        = require('./routes/auth');
const employeeRoutes    = require('./routes/employees');
const attendanceRoutes  = require('./routes/attendance');
const geofenceRoutes    = require('./routes/geofences');
const reportRoutes      = require('./routes/reports');
const settingsRoutes    = require('./routes/settings');
const alertRoutes       = require('./routes/alerts');

const { authenticateToken } = require('./middleware/auth');
const { auditLog }          = require('./middleware/audit');
const db                    = require('./models/database');

const app  = express();
const PORT = process.env.PORT || 3000;

// ====== Security middleware ======
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  credentials: true
}));

// Rate limiting — general
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
}));

// Strict rate limit for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts.' }
});

// ====== Body parsing ======
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ====== Logging ======
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ====== Health check ======
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ====== Routes ======
app.use('/api/auth',       loginLimiter, authRoutes);
app.use('/api/employees',  authenticateToken, auditLog, employeeRoutes);
app.use('/api/attendance', authenticateToken, auditLog, attendanceRoutes);
app.use('/api/geofences',  authenticateToken, auditLog, geofenceRoutes);
app.use('/api/reports',    authenticateToken, reportRoutes);
app.use('/api/settings',   authenticateToken, auditLog, settingsRoutes);
app.use('/api/alerts',     authenticateToken, alertRoutes);

// ====== 404 handler ======
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ====== Global error handler ======
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// ====== Start ======
app.listen(PORT, () => {
  console.log(`🏝️  Karaja Attendance Server running on port ${PORT}`);
  console.log(`📡  Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
