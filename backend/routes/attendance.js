/**
 * Attendance Routes
 *
 * POST /api/attendance/checkin      — Employee check-in (from mobile app)
 * POST /api/attendance/checkout     — Employee check-out
 * POST /api/attendance/periodic     — Periodic location ping (every 30 min)
 * GET  /api/attendance              — List logs (admin dashboard)
 * GET  /api/attendance/today        — Today's summary
 * GET  /api/attendance/live         — Live positions of all employees
 */

const express  = require('express');
const db       = require('../models/database');
const { isInsideGeofence, detectFakeGps } = require('../utils/gpsVerification');

const router = express.Router();

// ── Helper: get employee's assigned geofence ──────────────────────────────────
async function getEmployeeGeofence(employeeId) {
  const { rows } = await db.query(
    `SELECT g.* FROM geofences g
     JOIN employees e ON e.geofence_id = g.id
     WHERE e.id = $1 AND g.active = true`,
    [employeeId]
  );
  return rows[0] || null;
}

// ── Helper: get last attendance record for speed check ────────────────────────
async function getLastRecord(employeeId) {
  const { rows } = await db.query(
    `SELECT lat, lng, recorded_at AS timestamp
     FROM attendance_logs
     WHERE employee_id = $1
     ORDER BY recorded_at DESC
     LIMIT 1`,
    [employeeId]
  );
  return rows[0] || null;
}

// ── Check-in ──────────────────────────────────────────────────────────────────
router.post('/checkin', async (req, res) => {
  try {
    const {
      employeeId, lat, lng,
      accuracy, altitude, provider,
      deviceId, deviceFingerprint
    } = req.body;

    if (!employeeId || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'employeeId, lat, lng are required' });
    }

    // Device binding check
    const { rows: empRows } = await db.query(
      'SELECT * FROM employees WHERE id = $1 AND status = $2',
      [employeeId, 'active']
    );
    if (!empRows.length) return res.status(404).json({ error: 'Employee not found or inactive' });

    const employee = empRows[0];
    if (employee.device_id && employee.device_id !== deviceId) {
      return res.status(403).json({ error: 'Device not authorized for this account' });
    }

    // Geofence check
    const geofence = await getEmployeeGeofence(employeeId);
    let insideGeofence = false;
    let distanceFromCenter = null;

    if (geofence) {
      const result = isInsideGeofence(lat, lng, geofence);
      insideGeofence = result.inside;
      distanceFromCenter = result.distance;
    }

    // Fake GPS detection
    const lastRecord = await getLastRecord(employeeId);
    const gpsCheck = detectFakeGps({
      accuracy, altitude, provider,
      lastRecord,
      currentLat: lat, currentLng: lng,
      currentTimestamp: new Date()
    });

    // Insert attendance record
    const { rows: logRows } = await db.query(
      `INSERT INTO attendance_logs
        (employee_id, type, lat, lng, accuracy, altitude, provider,
         inside_geofence, distance_from_center, geofence_id,
         fake_gps_detected, fake_gps_signals, device_id)
       VALUES ($1,'check_in',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        employeeId, lat, lng, accuracy, altitude, provider,
        insideGeofence, distanceFromCenter, geofence?.id || null,
        gpsCheck.isFake, JSON.stringify(gpsCheck.signals), deviceId
      ]
    );

    // Create alert if outside geofence or fake GPS
    if (!insideGeofence || gpsCheck.isFake) {
      const alertType = gpsCheck.isFake ? 'fake_gps' : 'outside_geofence';
      await db.query(
        `INSERT INTO alerts (employee_id, type, message, severity)
         VALUES ($1, $2, $3, $4)`,
        [
          employeeId, alertType,
          gpsCheck.isFake
            ? `Fake GPS detected for ${employee.name}`
            : `Employee ${employee.name} checked in outside geofence (${distanceFromCenter}m away)`,
          gpsCheck.isFake ? 'high' : 'medium'
        ]
      );
    }

    res.status(201).json({
      success: true,
      log: logRows[0],
      insideGeofence,
      distanceFromCenter,
      fakeGpsDetected: gpsCheck.isFake,
      message: insideGeofence
        ? 'Check-in recorded successfully'
        : `Warning: You are ${distanceFromCenter}m outside your work zone`
    });

  } catch (err) {
    console.error('/attendance/checkin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Check-out ─────────────────────────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  try {
    const { employeeId, lat, lng, accuracy, altitude, provider, deviceId } = req.body;

    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });

    const geofence = await getEmployeeGeofence(employeeId);
    let insideGeofence = false;
    if (geofence) {
      insideGeofence = isInsideGeofence(lat, lng, geofence).inside;
    }

    const lastRecord = await getLastRecord(employeeId);
    const gpsCheck = detectFakeGps({
      accuracy, altitude, provider, lastRecord,
      currentLat: lat, currentLng: lng, currentTimestamp: new Date()
    });

    const { rows } = await db.query(
      `INSERT INTO attendance_logs
        (employee_id, type, lat, lng, accuracy, altitude, provider,
         inside_geofence, geofence_id, fake_gps_detected, fake_gps_signals, device_id)
       VALUES ($1,'check_out',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        employeeId, lat, lng, accuracy, altitude, provider,
        insideGeofence, geofence?.id || null,
        gpsCheck.isFake, JSON.stringify(gpsCheck.signals), deviceId
      ]
    );

    res.status(201).json({ success: true, log: rows[0] });

  } catch (err) {
    console.error('/attendance/checkout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Periodic ping ─────────────────────────────────────────────────────────────
router.post('/periodic', async (req, res) => {
  try {
    const { employeeId, lat, lng, accuracy, altitude, provider, deviceId } = req.body;

    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });

    const geofence = await getEmployeeGeofence(employeeId);
    let insideGeofence = false, distanceFromCenter = null;
    if (geofence) {
      const r = isInsideGeofence(lat, lng, geofence);
      insideGeofence = r.inside;
      distanceFromCenter = r.distance;
    }

    const lastRecord = await getLastRecord(employeeId);
    const gpsCheck = detectFakeGps({
      accuracy, altitude, provider, lastRecord,
      currentLat: lat, currentLng: lng, currentTimestamp: new Date()
    });

    await db.query(
      `INSERT INTO attendance_logs
        (employee_id, type, lat, lng, accuracy, altitude, provider,
         inside_geofence, distance_from_center, geofence_id,
         fake_gps_detected, fake_gps_signals, device_id)
       VALUES ($1,'periodic',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        employeeId, lat, lng, accuracy, altitude, provider,
        insideGeofence, distanceFromCenter, geofence?.id || null,
        gpsCheck.isFake, JSON.stringify(gpsCheck.signals), deviceId
      ]
    );

    // Update live positions table
    await db.query(
      `INSERT INTO live_positions (employee_id, lat, lng, inside_geofence, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (employee_id) DO UPDATE
         SET lat = $2, lng = $3, inside_geofence = $4, updated_at = NOW()`,
      [employeeId, lat, lng, insideGeofence]
    );

    res.json({ success: true, insideGeofence, fakeGpsDetected: gpsCheck.isFake });

  } catch (err) {
    console.error('/attendance/periodic error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── List logs (dashboard) ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      date, employeeId, type,
      page = 1, limit = 20
    } = req.query;

    let conditions = [];
    let params = [];
    let idx = 1;

    if (date)       { conditions.push(`al.recorded_at::date = $${idx++}`); params.push(date); }
    if (employeeId) { conditions.push(`al.employee_id = $${idx++}`);        params.push(employeeId); }
    if (type)       { conditions.push(`al.type = $${idx++}`);               params.push(type); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows } = await db.query(
      `SELECT al.*, e.name AS employee_name, g.name AS geofence_name
       FROM attendance_logs al
       LEFT JOIN employees e ON e.id = al.employee_id
       LEFT JOIN geofences g ON g.id = al.geofence_id
       ${where}
       ORDER BY al.recorded_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM attendance_logs al ${where}`,
      params
    );

    res.json({
      logs: rows,
      total: parseInt(countRows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (err) {
    console.error('/attendance GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Today's summary ───────────────────────────────────────────────────────────
router.get('/today', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN al.type = 'check_in' THEN al.employee_id END) AS present,
        COUNT(DISTINCT e.id) FILTER (WHERE al.employee_id IS NULL) AS absent,
        COUNT(DISTINCT CASE WHEN al.fake_gps_detected = true THEN al.employee_id END) AS fake_gps,
        COUNT(DISTINCT CASE WHEN al.inside_geofence = false AND al.type = 'check_in' THEN al.employee_id END) AS outside
      FROM employees e
      LEFT JOIN attendance_logs al ON al.employee_id = e.id AND al.recorded_at::date = CURRENT_DATE
      WHERE e.status = 'active'
    `);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Live positions ────────────────────────────────────────────────────────────
router.get('/live', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT lp.*, e.name, e.department, e.photo_url,
             g.name AS geofence_name
      FROM live_positions lp
      JOIN employees e ON e.id = lp.employee_id
      LEFT JOIN employees emp ON emp.id = lp.employee_id
      LEFT JOIN geofences g ON g.id = emp.geofence_id
      WHERE lp.updated_at > NOW() - INTERVAL '1 hour'
    `);
    res.json({ positions: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
