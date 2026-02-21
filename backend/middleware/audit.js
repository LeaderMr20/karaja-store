/**
 * Audit Log Middleware
 * Automatically records every mutating API call to the audit_logs table.
 */

const db = require('../models/database');

async function auditLog(req, res, next) {
  // Only log mutating operations
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const original = res.json.bind(res);
  res.json = async (body) => {
    try {
      await db.query(
        `INSERT INTO audit_logs (user_id, user_name, action, details, ip_address, http_method, path)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user?.id || null,
          req.user?.name || 'system',
          `${req.method} ${req.path}`,
          JSON.stringify({ body: req.body, status: res.statusCode }).slice(0, 500),
          req.ip,
          req.method,
          req.path,
        ]
      );
    } catch (err) {
      console.error('[Audit] Failed to write audit log:', err.message);
    }
    return original(body);
  };

  next();
}

module.exports = { auditLog };
