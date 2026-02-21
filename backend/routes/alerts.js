/**
 * Alerts Routes
 */

const express = require('express');
const db      = require('../models/database');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT a.*, e.name AS employee_name
      FROM alerts a
      LEFT JOIN employees e ON e.id = a.employee_id
      ORDER BY a.created_at DESC
      LIMIT 100
    `);
    res.json({ alerts: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    await db.query('UPDATE alerts SET read = true WHERE id = $1', [req.params.id]);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/read-all', async (req, res) => {
  try {
    await db.query('UPDATE alerts SET read = true');
    res.json({ message: 'All marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
