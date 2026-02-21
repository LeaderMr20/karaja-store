/**
 * Geofences Routes
 */

const express = require('express');
const db      = require('../models/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM geofences WHERE active = true ORDER BY name');
    res.json({ geofences: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, lat, lng, radius, color } = req.body;
    if (!name || lat === undefined || lng === undefined || !radius) {
      return res.status(400).json({ error: 'name, lat, lng, radius are required' });
    }
    const { rows } = await db.query(
      `INSERT INTO geofences (name, lat, lng, radius, color) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, lat, lng, radius, color || '#1a56db']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, lat, lng, radius, color, active } = req.body;
    const { rows } = await db.query(
      `UPDATE geofences
       SET name = COALESCE($1, name), lat = COALESCE($2, lat), lng = COALESCE($3, lng),
           radius = COALESCE($4, radius), color = COALESCE($5, color),
           active = COALESCE($6, active), updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name, lat, lng, radius, color, active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Geofence not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('UPDATE geofences SET active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Geofence deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
