/**
 * Employees Routes
 * GET    /api/employees
 * GET    /api/employees/:id
 * POST   /api/employees
 * PUT    /api/employees/:id
 * DELETE /api/employees/:id
 * POST   /api/employees/:id/bind-device
 * DELETE /api/employees/:id/unbind-device
 */

const express = require('express');
const db      = require('../models/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── List employees ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { dept, status, search, page = 1, limit = 50 } = req.query;

    let conditions = [];
    let params = [];
    let idx = 1;

    if (dept)   { conditions.push(`e.department = $${idx++}`); params.push(dept); }
    if (status) { conditions.push(`e.status = $${idx++}`);     params.push(status); }
    if (search) {
      conditions.push(`(e.name ILIKE $${idx} OR e.phone ILIKE $${idx} OR e.email ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows } = await db.query(
      `SELECT e.*, g.name AS geofence_name
       FROM employees e
       LEFT JOIN geofences g ON g.id = e.geofence_id
       ${where}
       ORDER BY e.name ASC
       LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM employees e ${where}`, params
    );

    res.json({ employees: rows, total: parseInt(countRows[0].count) });

  } catch (err) {
    console.error('/employees GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Get single employee ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.*, g.name AS geofence_name
       FROM employees e
       LEFT JOIN geofences g ON g.id = e.geofence_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Create employee ───────────────────────────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, department, phone, email, geofenceId, employeeNumber } = req.body;

    if (!name || !department) {
      return res.status(400).json({ error: 'name and department are required' });
    }

    const { rows } = await db.query(
      `INSERT INTO employees (name, department, phone, email, geofence_id, employee_number)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, department, phone || null, email || null, geofenceId || null, employeeNumber || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Employee number or email already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Update employee ───────────────────────────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, department, phone, email, geofenceId, status } = req.body;

    const { rows } = await db.query(
      `UPDATE employees
       SET name = COALESCE($1, name),
           department = COALESCE($2, department),
           phone = COALESCE($3, phone),
           email = COALESCE($4, email),
           geofence_id = COALESCE($5, geofence_id),
           status = COALESCE($6, status),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [name, department, phone, email, geofenceId, status, req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Delete employee ───────────────────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    // Soft delete
    const { rows } = await db.query(
      `UPDATE employees SET status = 'deleted', updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Bind device to employee ───────────────────────────────────────────────────
router.post('/:id/bind-device', requireAdmin, async (req, res) => {
  try {
    const { deviceId, deviceName } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

    // Ensure no other employee has this device
    const { rows: existing } = await db.query(
      'SELECT id FROM employees WHERE device_id = $1 AND id != $2',
      [deviceId, req.params.id]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Device already bound to another employee' });
    }

    const { rows } = await db.query(
      `UPDATE employees SET device_id = $1, device_name = $2, device_bound_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [deviceId, deviceName || null, req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Device bound successfully', employee: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Unbind device ─────────────────────────────────────────────────────────────
router.delete('/:id/unbind-device', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE employees SET device_id = NULL, device_name = NULL, device_bound_at = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Device unbound successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
