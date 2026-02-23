<?php
/**
 * Karaja Island Attendance System — Setup Wizard
 *
 * Visit: http://desire.free.nf/setup.php
 *
 * This wizard will:
 *   1. Test your MySQL connection
 *   2. Create all database tables
 *   3. Insert default admin user and sample data
 *   4. Write api/config.php with your credentials
 *
 * ⚠️  DELETE or RENAME this file after setup is complete!
 */

// ── Block re-run if already installed & working ───────────────────────────────
$configFile = __DIR__ . '/api/config.php';
$alreadyDone = false;
if (file_exists($configFile) && !isset($_GET['force'])) {
    @include_once $configFile;
    if (defined('DB_HOST') && DB_HOST !== '') {
        try {
            $testPdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER, DB_PASS
            );
            $alreadyDone = true;
        } catch (Exception $e) { /* not working — allow re-run */ }
    }
}

$error   = '';
$success = false;

// ── Handle Form Submission ────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$alreadyDone) {
    $dbHost      = trim($_POST['db_host']       ?? '');
    $dbName      = trim($_POST['db_name']       ?? '');
    $dbUser      = trim($_POST['db_user']       ?? '');
    $dbPass      = $_POST['db_pass']            ?? '';
    $adminName   = trim($_POST['admin_name']    ?? 'مدير النظام');
    $adminEmail  = trim($_POST['admin_email']   ?? 'admin@karaja.com');
    $adminPass   = $_POST['admin_pass']         ?? 'admin123';
    $jwtSecret   = bin2hex(random_bytes(32));   // secure random secret

    if (!$dbHost || !$dbName || !$dbUser) {
        $error = 'يرجى ملء جميع حقول قاعدة البيانات.';
    } else {
        try {
            // 1. Test connection
            $pdo = new PDO(
                "mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4",
                $dbUser, $dbPass,
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            );

            // 2. Create tables
            $tables = [
                // Admin Users
                "CREATE TABLE IF NOT EXISTS admin_users (
                    id               INT AUTO_INCREMENT PRIMARY KEY,
                    name             VARCHAR(100) NOT NULL,
                    email            VARCHAR(150) NOT NULL UNIQUE,
                    password_hash    VARCHAR(255) NOT NULL,
                    role             ENUM('admin','supervisor','viewer') NOT NULL DEFAULT 'admin',
                    active           TINYINT(1) NOT NULL DEFAULT 1,
                    failed_attempts  INT NOT NULL DEFAULT 0,
                    last_login       DATETIME NULL,
                    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                // Geofences
                "CREATE TABLE IF NOT EXISTS geofences (
                    id         INT AUTO_INCREMENT PRIMARY KEY,
                    name       VARCHAR(100) NOT NULL,
                    lat        DOUBLE NOT NULL,
                    lng        DOUBLE NOT NULL,
                    radius     INT NOT NULL DEFAULT 200,
                    color      VARCHAR(20) DEFAULT '#1a56db',
                    active     TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                // Employees
                "CREATE TABLE IF NOT EXISTS employees (
                    id               INT AUTO_INCREMENT PRIMARY KEY,
                    employee_number  VARCHAR(30) UNIQUE,
                    name             VARCHAR(150) NOT NULL,
                    department       VARCHAR(100) NOT NULL,
                    phone            VARCHAR(20),
                    email            VARCHAR(150) UNIQUE,
                    photo_url        TEXT,
                    geofence_id      INT NULL,
                    device_id        VARCHAR(200) UNIQUE NULL,
                    device_name      VARCHAR(100) NULL,
                    device_bound_at  DATETIME NULL,
                    password_hash    VARCHAR(255) NULL,
                    shift_start      TIME NOT NULL DEFAULT '08:00:00',
                    shift_end        TIME NOT NULL DEFAULT '17:00:00',
                    status           ENUM('active','inactive','deleted') NOT NULL DEFAULT 'active',
                    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                // Attendance Logs
                "CREATE TABLE IF NOT EXISTS attendance_logs (
                    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
                    employee_id          INT NOT NULL,
                    type                 ENUM('check_in','check_out','periodic') NOT NULL,
                    lat                  DOUBLE NOT NULL,
                    lng                  DOUBLE NOT NULL,
                    accuracy             DOUBLE NULL,
                    altitude             DOUBLE NULL,
                    provider             VARCHAR(30) NULL,
                    inside_geofence      TINYINT(1) NOT NULL DEFAULT 0,
                    distance_from_center INT NULL,
                    geofence_id          INT NULL,
                    fake_gps_detected    TINYINT(1) NOT NULL DEFAULT 0,
                    fake_gps_signals     TEXT NULL,
                    device_id            VARCHAR(200) NULL,
                    recorded_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX (employee_id),
                    INDEX (recorded_at),
                    INDEX (type),
                    FOREIGN KEY (employee_id) REFERENCES employees(id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                // Live Positions
                "CREATE TABLE IF NOT EXISTS live_positions (
                    employee_id     INT PRIMARY KEY,
                    lat             DOUBLE NULL,
                    lng             DOUBLE NULL,
                    accuracy        DOUBLE NULL,
                    inside_geofence TINYINT(1) DEFAULT 0,
                    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (employee_id) REFERENCES employees(id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                // Alerts
                "CREATE TABLE IF NOT EXISTS alerts (
                    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
                    employee_id INT NULL,
                    type        VARCHAR(50) NOT NULL,
                    message     TEXT NOT NULL,
                    severity    ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
                    is_read     TINYINT(1) NOT NULL DEFAULT 0,
                    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX (is_read),
                    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                // Audit Logs
                "CREATE TABLE IF NOT EXISTS audit_logs (
                    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
                    user_id     INT NULL,
                    user_name   VARCHAR(150),
                    action      VARCHAR(200) NOT NULL,
                    details     TEXT,
                    ip_address  VARCHAR(45),
                    http_method VARCHAR(10),
                    path        VARCHAR(500),
                    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

                // System Settings
                "CREATE TABLE IF NOT EXISTS system_settings (
                    id                        INT PRIMARY KEY DEFAULT 1,
                    start_time                TIME NOT NULL DEFAULT '08:00:00',
                    end_time                  TIME NOT NULL DEFAULT '17:00:00',
                    late_threshold_minutes    INT NOT NULL DEFAULT 15,
                    periodic_interval_minutes INT NOT NULL DEFAULT 30,
                    default_radius_m          INT NOT NULL DEFAULT 200,
                    gps_accuracy_m            INT NOT NULL DEFAULT 50,
                    fake_gps_detection        TINYINT(1) NOT NULL DEFAULT 1,
                    device_binding            TINYINT(1) NOT NULL DEFAULT 1,
                    notif_email               VARCHAR(150) NULL,
                    notif_absent              TINYINT(1) NOT NULL DEFAULT 1,
                    notif_outside             TINYINT(1) NOT NULL DEFAULT 1,
                    notif_fake_gps            TINYINT(1) NOT NULL DEFAULT 1,
                    updated_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            ];

            foreach ($tables as $sql) {
                $pdo->exec($sql);
            }

            // 3. Seed default settings
            $pdo->exec(
                "INSERT IGNORE INTO system_settings (id) VALUES (1)"
            );

            // 4. Seed sample geofences
            $pdo->exec(
                "INSERT IGNORE INTO geofences (id, name, lat, lng, radius, color) VALUES
                 (1, 'المقر الرئيسي',  24.7136, 46.6753, 200, '#1a56db'),
                 (2, 'الفرع الشمالي',  24.7250, 46.6500, 150, '#0e9f6e'),
                 (3, 'مستودع الخدمات', 24.7050, 46.6900, 300, '#d97706')"
            );

            // 5. Create admin user
            $adminHash = password_hash($adminPass, PASSWORD_BCRYPT);
            $stmt = $pdo->prepare(
                "INSERT INTO admin_users (name, email, password_hash, role)
                 VALUES (?, ?, ?, 'admin')
                 ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)"
            );
            $stmt->execute([$adminName, $adminEmail, $adminHash]);

            // 6. Write api/config.php
            $configContent = <<<PHP
<?php
/**
 * Karaja Island — API Configuration (auto-generated by setup.php)
 * ⚠️  Do NOT commit this file to GitHub
 */
define('DB_HOST', '$dbHost');
define('DB_NAME', '$dbName');
define('DB_USER', '$dbUser');
define('DB_PASS', '$dbPass');
define('JWT_SECRET', '$jwtSecret');
define('JWT_EXPIRE', 86400 * 7);
define('APP_TZ', 'Asia/Riyadh');
date_default_timezone_set(APP_TZ);
PHP;
            file_put_contents($configFile, $configContent);
            $success = true;

        } catch (PDOException $e) {
            $error = 'فشل الاتصال بقاعدة البيانات: ' . $e->getMessage();
        } catch (Exception $e) {
            $error = 'خطأ: ' . $e->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>إعداد نظام كراجا للحضور</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      padding: 40px;
      width: 100%;
      max-width: 560px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo .icon { font-size: 56px; }
    .logo h1 { font-size: 22px; font-weight: 800; color: #1e1b4b; margin-top: 8px; }
    .logo p  { font-size: 13px; color: #6b7280; margin-top: 4px; }

    .section-title {
      font-size: 13px; font-weight: 700; color: #6366f1;
      text-transform: uppercase; letter-spacing: 0.5px;
      margin: 24px 0 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid #e0e7ff;
    }

    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media(max-width:480px) { .form-row { grid-template-columns: 1fr; } }

    .field { margin-bottom: 16px; }
    label  { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    input  {
      width: 100%; padding: 10px 14px;
      border: 1.5px solid #d1d5db; border-radius: 10px;
      font-size: 14px; color: #111; direction: ltr;
      transition: border-color .2s;
    }
    input:focus { outline: none; border-color: #6366f1; }

    .hint { font-size: 11px; color: #9ca3af; margin-top: 4px; }

    .alert {
      padding: 14px 16px; border-radius: 10px;
      font-size: 13px; margin-bottom: 20px; line-height: 1.6;
    }
    .alert-error   { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; }
    .alert-success { background: #f0fdf4; border: 1px solid #86efac; color: #15803d; }
    .alert-warning { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; }

    .btn {
      display: block; width: 100%; padding: 14px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff; border: none; border-radius: 12px;
      font-size: 16px; font-weight: 700; cursor: pointer;
      margin-top: 24px; transition: opacity .2s;
    }
    .btn:hover { opacity: .9; }

    .success-icon { font-size: 64px; text-align: center; margin-bottom: 16px; }
    .success-title { font-size: 22px; font-weight: 800; color: #15803d; text-align: center; }
    .success-body  { font-size: 14px; color: #374151; text-align: center; margin-top: 12px; line-height: 1.8; }

    .creds-box {
      background: #f3f4f6; border-radius: 12px; padding: 16px 20px;
      margin: 20px 0; font-size: 14px; line-height: 2;
    }
    .creds-box strong { color: #6366f1; }

    .link-btn {
      display: inline-block; margin-top: 16px; padding: 12px 28px;
      background: #6366f1; color: #fff; text-decoration: none;
      border-radius: 10px; font-weight: 700; font-size: 14px;
    }

    .already-done {
      text-align: center; padding: 16px 0;
    }

    .steps { counter-reset: step; margin: 16px 0; }
    .step  { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; }
    .step::before {
      counter-increment: step;
      content: counter(step);
      min-width: 24px; height: 24px;
      background: #6366f1; color: #fff;
      border-radius: 50%; font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .step span { font-size: 13px; color: #374151; padding-top: 3px; }
  </style>
</head>
<body>
<div class="card">

  <div class="logo">
    <div class="icon">🏝️</div>
    <h1>نظام كراجا للحضور</h1>
    <p>معالج الإعداد والتثبيت</p>
  </div>

  <?php if ($alreadyDone): ?>
    <!-- Already installed -->
    <div class="alert alert-warning">
      ✅ النظام مثبّت بالفعل ويعمل بشكل صحيح.
      <br>لإعادة الإعداد <a href="?force=1" style="color:#92400e;font-weight:700;">اضغط هنا</a>.
    </div>
    <div class="already-done">
      <a href="/" class="link-btn">🏠 الذهاب للوحة التحكم</a>
    </div>

  <?php elseif ($success): ?>
    <!-- Success screen -->
    <div class="success-icon">🎉</div>
    <div class="success-title">تم الإعداد بنجاح!</div>
    <div class="success-body">تم إنشاء قاعدة البيانات وضبط الإعدادات.</div>

    <div class="creds-box">
      <strong>بيانات الدخول للوحة التحكم:</strong><br>
      البريد: <?= htmlspecialchars($adminEmail ?? 'admin@karaja.com') ?><br>
      كلمة المرور: <?= htmlspecialchars($adminPass ?? 'admin123') ?><br><br>
      <strong>بيانات الدخول للموظفين (تطبيق الجوال):</strong><br>
      البريد الإلكتروني أو رقم الجوال<br>
      كلمة المرور الافتراضية: <strong>karaja123</strong>
    </div>

    <div class="alert alert-warning" style="margin-top:0;">
      ⚠️ <strong>مهم:</strong> احذف هذا الملف (setup.php) الآن لحماية نظامك!
    </div>

    <div style="text-align:center;">
      <a href="/" class="link-btn">🏠 الذهاب للوحة التحكم</a>
    </div>

  <?php else: ?>
    <!-- Setup Form -->
    <?php if ($error): ?>
      <div class="alert alert-error">❌ <?= htmlspecialchars($error) ?></div>
    <?php endif; ?>

    <div class="steps">
      <div class="step"><span>احصل على بيانات MySQL من لوحة InfinityFree: <br>Panel → Hosting → Manage → MySQL Databases</span></div>
      <div class="step"><span>أنشئ قاعدة بيانات جديدة من نفس القسم واحفظ اسمها</span></div>
      <div class="step"><span>أدخل البيانات أدناه واضغط تثبيت</span></div>
    </div>

    <form method="POST" action="">

      <div class="section-title">⚙️ إعدادات قاعدة البيانات</div>

      <div class="field">
        <label>مضيف MySQL (Host)</label>
        <input type="text" name="db_host"
               placeholder="مثال: sql209.infinityfree.com"
               value="<?= htmlspecialchars($_POST['db_host'] ?? '') ?>"
               required />
        <div class="hint">تجده في InfinityFree → MySQL Databases → MySQL Server</div>
      </div>

      <div class="form-row">
        <div class="field">
          <label>اسم قاعدة البيانات</label>
          <input type="text" name="db_name"
                 placeholder="if0_41215283_karaja"
                 value="<?= htmlspecialchars($_POST['db_name'] ?? '') ?>"
                 required />
        </div>
        <div class="field">
          <label>مستخدم MySQL</label>
          <input type="text" name="db_user"
                 placeholder="if0_41215283"
                 value="<?= htmlspecialchars($_POST['db_user'] ?? '') ?>"
                 required />
        </div>
      </div>

      <div class="field">
        <label>كلمة مرور MySQL</label>
        <input type="password" name="db_pass"
               placeholder="كلمة مرور قاعدة البيانات"
               value="<?= htmlspecialchars($_POST['db_pass'] ?? '') ?>" />
        <div class="hint">يمكن أن تكون فارغة إذا لم تُعيَّن</div>
      </div>

      <div class="section-title">👤 حساب المدير</div>

      <div class="field">
        <label>اسم المدير</label>
        <input type="text" name="admin_name"
               placeholder="مدير النظام"
               value="<?= htmlspecialchars($_POST['admin_name'] ?? 'مدير النظام') ?>"
               style="direction:rtl;" />
      </div>

      <div class="form-row">
        <div class="field">
          <label>البريد الإلكتروني للمدير</label>
          <input type="email" name="admin_email"
                 placeholder="admin@karaja.com"
                 value="<?= htmlspecialchars($_POST['admin_email'] ?? 'admin@karaja.com') ?>" />
        </div>
        <div class="field">
          <label>كلمة مرور المدير</label>
          <input type="password" name="admin_pass"
                 placeholder="على الأقل 8 أحرف"
                 value="<?= htmlspecialchars($_POST['admin_pass'] ?? 'admin123') ?>" />
        </div>
      </div>

      <button type="submit" class="btn">🚀 تثبيت النظام</button>

    </form>
  <?php endif; ?>

</div>
</body>
</html>
