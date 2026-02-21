-- ============================================================
--  Karaja Island Attendance System — PostgreSQL Schema
--  Run: psql -U karaja_user -d karaja_attendance -f schema.sql
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";  -- Optional: for geo queries

-- ============================================================
-- 1. Admin Users (Dashboard access)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(100) NOT NULL,
  email            VARCHAR(150) UNIQUE NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  role             VARCHAR(20)  NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'supervisor', 'viewer')),
  active           BOOLEAN      NOT NULL DEFAULT true,
  failed_attempts  INTEGER      NOT NULL DEFAULT 0,
  last_login       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. Geofences (Work Zones)
-- ============================================================
CREATE TABLE IF NOT EXISTS geofences (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  radius      INTEGER NOT NULL DEFAULT 200 CHECK (radius > 0),  -- metres
  color       VARCHAR(20) DEFAULT '#1a56db',
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. Employees
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id               SERIAL PRIMARY KEY,
  employee_number  VARCHAR(30) UNIQUE,
  name             VARCHAR(150) NOT NULL,
  department       VARCHAR(100) NOT NULL,
  phone            VARCHAR(20),
  email            VARCHAR(150) UNIQUE,
  photo_url        TEXT,
  geofence_id      INTEGER REFERENCES geofences(id) ON DELETE SET NULL,
  -- Device Binding
  device_id        VARCHAR(200) UNIQUE,
  device_name      VARCHAR(100),
  device_bound_at  TIMESTAMPTZ,
  -- Status
  status           VARCHAR(20) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'inactive', 'deleted')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_status     ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_device_id  ON employees(device_id);
CREATE INDEX IF NOT EXISTS idx_employees_dept       ON employees(department);

-- ============================================================
-- 4. Attendance Logs  (core table)
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_logs (
  id                  BIGSERIAL PRIMARY KEY,
  employee_id         INTEGER NOT NULL REFERENCES employees(id),
  type                VARCHAR(20) NOT NULL CHECK (type IN ('check_in', 'check_out', 'periodic')),
  -- Location
  lat                 DOUBLE PRECISION NOT NULL,
  lng                 DOUBLE PRECISION NOT NULL,
  accuracy            DOUBLE PRECISION,           -- GPS accuracy in metres
  altitude            DOUBLE PRECISION,
  provider            VARCHAR(30),                -- 'gps' | 'network' | 'fused'
  -- Geofence result
  inside_geofence     BOOLEAN NOT NULL DEFAULT false,
  distance_from_center INTEGER,                   -- metres from geofence center
  geofence_id         INTEGER REFERENCES geofences(id) ON DELETE SET NULL,
  -- Security
  fake_gps_detected   BOOLEAN NOT NULL DEFAULT false,
  fake_gps_signals    JSONB   DEFAULT '[]',
  device_id           VARCHAR(200),
  -- Timestamp
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_employee  ON attendance_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date      ON attendance_logs(recorded_at::date);
CREATE INDEX IF NOT EXISTS idx_attendance_type      ON attendance_logs(type);
CREATE INDEX IF NOT EXISTS idx_attendance_fake_gps  ON attendance_logs(fake_gps_detected) WHERE fake_gps_detected = true;
CREATE INDEX IF NOT EXISTS idx_attendance_outside   ON attendance_logs(inside_geofence)   WHERE inside_geofence = false;

-- ============================================================
-- 5. Live Positions  (one row per employee, upserted every ping)
-- ============================================================
CREATE TABLE IF NOT EXISTS live_positions (
  employee_id      INTEGER PRIMARY KEY REFERENCES employees(id),
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  accuracy         DOUBLE PRECISION,
  inside_geofence  BOOLEAN DEFAULT false,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. Alerts
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id           BIGSERIAL PRIMARY KEY,
  employee_id  INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,          -- 'fake_gps' | 'outside_geofence' | 'absent' | ...
  message      TEXT NOT NULL,
  severity     VARCHAR(20) NOT NULL DEFAULT 'medium'
                 CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  read         BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_read       ON alerts(read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_alerts_employee   ON alerts(employee_id);

-- ============================================================
-- 7. Audit Logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  user_name    VARCHAR(150),
  action       VARCHAR(200) NOT NULL,
  details      TEXT,
  ip_address   INET,
  http_method  VARCHAR(10),
  path         VARCHAR(500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user       ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);

-- ============================================================
-- 8. System Settings  (single row, upserted)
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
  id                          INTEGER PRIMARY KEY DEFAULT 1,
  start_time                  TIME NOT NULL DEFAULT '08:00',
  end_time                    TIME NOT NULL DEFAULT '17:00',
  late_threshold_minutes      INTEGER NOT NULL DEFAULT 15,
  periodic_interval_minutes   INTEGER NOT NULL DEFAULT 30,
  default_radius_m            INTEGER NOT NULL DEFAULT 200,
  gps_accuracy_m              INTEGER NOT NULL DEFAULT 50,
  fake_gps_detection          BOOLEAN NOT NULL DEFAULT true,
  device_binding              BOOLEAN NOT NULL DEFAULT true,
  notif_email                 VARCHAR(150),
  notif_absent                BOOLEAN NOT NULL DEFAULT true,
  notif_outside               BOOLEAN NOT NULL DEFAULT true,
  notif_fake_gps              BOOLEAN NOT NULL DEFAULT true,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default settings
INSERT INTO system_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. Useful Views
-- ============================================================

-- Today's attendance summary per employee
CREATE OR REPLACE VIEW v_today_attendance AS
SELECT
  e.id,
  e.name,
  e.department,
  e.geofence_id,
  MAX(al.recorded_at) FILTER (WHERE al.type = 'check_in')  AS last_checkin,
  MAX(al.recorded_at) FILTER (WHERE al.type = 'check_out') AS last_checkout,
  BOOL_OR(al.inside_geofence) FILTER (WHERE al.type = 'check_in') AS checked_in_inside,
  BOOL_OR(al.fake_gps_detected) AS any_fake_gps,
  lp.inside_geofence AS currently_inside,
  lp.updated_at      AS last_seen
FROM employees e
LEFT JOIN attendance_logs al
  ON al.employee_id = e.id AND al.recorded_at::date = CURRENT_DATE
LEFT JOIN live_positions lp ON lp.employee_id = e.id
WHERE e.status = 'active'
GROUP BY e.id, e.name, e.department, e.geofence_id, lp.inside_geofence, lp.updated_at;

-- ============================================================
-- 10. Seed Data (dev only — remove in production)
-- ============================================================

-- Default admin user: admin@karaja.com / admin123
INSERT INTO admin_users (name, email, password_hash, role)
VALUES (
  'مدير النظام',
  'admin@karaja.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2QHi3QLCYS',  -- bcrypt of 'admin123'
  'admin'
) ON CONFLICT (email) DO NOTHING;

-- Sample geofences
INSERT INTO geofences (name, lat, lng, radius, color) VALUES
  ('المقر الرئيسي',   24.7136, 46.6753, 200, '#1a56db'),
  ('الفرع الشمالي',   24.7250, 46.6500, 150, '#0e9f6e'),
  ('مستودع الخدمات',  24.7050, 46.6900, 300, '#d97706')
ON CONFLICT DO NOTHING;
