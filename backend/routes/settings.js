/**
 * Settings Routes
 */

const express = require('express');
const db      = require('../models/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM system_settings LIMIT 1');
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', requireAdmin, async (req, res) => {
  try {
    const {
      startTime, endTime, lateThresholdMinutes,
      periodicIntervalMinutes, defaultRadiusM,
      gpsAccuracyM, fakeGpsDetection, deviceBinding,
      notifEmail, notifAbsent, notifOutside, notifFakeGps
    } = req.body;

    await db.query(`
      INSERT INTO system_settings (id, start_time, end_time, late_threshold_minutes,
        periodic_interval_minutes, default_radius_m, gps_accuracy_m,
        fake_gps_detection, device_binding,
        notif_email, notif_absent, notif_outside, notif_fake_gps, updated_at)
      VALUES (1, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW())
      ON CONFLICT (id) DO UPDATE SET
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        late_threshold_minutes = EXCLUDED.late_threshold_minutes,
        periodic_interval_minutes = EXCLUDED.periodic_interval_minutes,
        default_radius_m = EXCLUDED.default_radius_m,
        gps_accuracy_m = EXCLUDED.gps_accuracy_m,
        fake_gps_detection = EXCLUDED.fake_gps_detection,
        device_binding = EXCLUDED.device_binding,
        notif_email = EXCLUDED.notif_email,
        notif_absent = EXCLUDED.notif_absent,
        notif_outside = EXCLUDED.notif_outside,
        notif_fake_gps = EXCLUDED.notif_fake_gps,
        updated_at = NOW()
    `, [
      startTime, endTime, lateThresholdMinutes,
      periodicIntervalMinutes, defaultRadiusM,
      gpsAccuracyM, fakeGpsDetection, deviceBinding,
      notifEmail, notifAbsent, notifOutside, notifFakeGps
    ]);

    res.json({ message: 'Settings saved' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
