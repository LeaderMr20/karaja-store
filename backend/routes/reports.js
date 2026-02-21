/**
 * Reports Routes
 */

const express = require('express');
const db      = require('../models/database');

const router = express.Router();

// Monthly summary
router.get('/monthly', async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = month || new Date().getMonth() + 1;
    const y = year  || new Date().getFullYear();

    const { rows } = await db.query(`
      SELECT
        e.id, e.name, e.department,
        COUNT(DISTINCT al.recorded_at::date) FILTER (WHERE al.type = 'check_in') AS days_present,
        COUNT(*) FILTER (WHERE al.fake_gps_detected = true) AS fake_gps_count,
        COUNT(*) FILTER (WHERE al.inside_geofence = false AND al.type = 'check_in') AS outside_count,
        AVG(EXTRACT(EPOCH FROM (al.recorded_at::time - '08:00:00'::time)) / 60)
          FILTER (WHERE al.type = 'check_in') AS avg_late_minutes
      FROM employees e
      LEFT JOIN attendance_logs al
        ON al.employee_id = e.id
        AND EXTRACT(MONTH FROM al.recorded_at) = $1
        AND EXTRACT(YEAR  FROM al.recorded_at) = $2
      WHERE e.status = 'active'
      GROUP BY e.id, e.name, e.department
      ORDER BY e.name
    `, [m, y]);

    res.json({ report: rows, month: m, year: y });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Department breakdown
router.get('/departments', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        e.department,
        COUNT(DISTINCT e.id) AS total_employees,
        COUNT(DISTINCT al.employee_id) FILTER (WHERE al.type = 'check_in' AND al.recorded_at::date = CURRENT_DATE) AS present_today,
        ROUND(
          100.0 * COUNT(DISTINCT al.employee_id) FILTER (WHERE al.type = 'check_in' AND al.recorded_at::date = CURRENT_DATE)
          / NULLIF(COUNT(DISTINCT e.id), 0), 1
        ) AS attendance_rate
      FROM employees e
      LEFT JOIN attendance_logs al ON al.employee_id = e.id
      WHERE e.status = 'active'
      GROUP BY e.department
      ORDER BY e.department
    `);
    res.json({ departments: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Violations report
router.get('/violations', async (req, res) => {
  try {
    const { from, to } = req.query;
    const { rows } = await db.query(`
      SELECT al.*, e.name AS employee_name, e.department
      FROM attendance_logs al
      JOIN employees e ON e.id = al.employee_id
      WHERE (al.fake_gps_detected = true OR al.inside_geofence = false)
        AND ($1::date IS NULL OR al.recorded_at::date >= $1)
        AND ($2::date IS NULL OR al.recorded_at::date <= $2)
      ORDER BY al.recorded_at DESC
      LIMIT 200
    `, [from || null, to || null]);
    res.json({ violations: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
