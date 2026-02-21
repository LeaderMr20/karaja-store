/**
 * Auth Routes
 * POST /api/auth/login
 * POST /api/auth/refresh
 * POST /api/auth/logout
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../models/database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await db.query(
      'SELECT * FROM admin_users WHERE email = $1 AND active = true LIMIT 1',
      [email.toLowerCase().trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      // Record failed attempt
      await db.query(
        'UPDATE admin_users SET failed_attempts = failed_attempts + 1 WHERE id = $1',
        [user.id]
      );
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset failed attempts on success
    await db.query(
      'UPDATE admin_users SET failed_attempts = 0, last_login = NOW() WHERE id = $1',
      [user.id]
    );

    const token = generateToken({
      id:   user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });

  } catch (err) {
    console.error('/auth/login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get current user ──────────────────────────────────────────────────────────
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ── Logout (client-side token discard, server logs it) ───────────────────────
router.post('/logout', authenticateToken, async (req, res) => {
  // In production, you can maintain a token blacklist in Redis
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
