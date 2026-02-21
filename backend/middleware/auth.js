/**
 * JWT Authentication Middleware
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET  || 'CHANGE_ME_IN_PRODUCTION_USE_STRONG_SECRET';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

/**
 * Generate JWT token for a user
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

/**
 * Middleware: verify JWT from Authorization header
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
}

/**
 * Middleware: require admin role
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { generateToken, authenticateToken, requireAdmin };
