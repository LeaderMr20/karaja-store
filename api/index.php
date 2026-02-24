<?php
/**
 * Karaja Island Attendance System — PHP REST API
 * Single-file router replacing the Node.js/Express backend.
 * Compatible with InfinityFree (PHP 7.4+, MySQL 5.7+, Apache mod_rewrite).
 *
 * Endpoints:
 *   POST   /api/auth/login
 *   GET    /api/auth/me
 *   POST   /api/auth/logout
 *   GET    /api/employees
 *   GET    /api/employees/:id
 *   POST   /api/employees
 *   PUT    /api/employees/:id
 *   DELETE /api/employees/:id
 *   POST   /api/employees/:id/bind-device
 *   DELETE /api/employees/:id/unbind-device
 *   POST   /api/attendance/checkin
 *   POST   /api/attendance/checkout
 *   POST   /api/attendance/periodic
 *   GET    /api/attendance
 *   GET    /api/attendance/today
 *   GET    /api/attendance/live
 *   GET    /api/geofences
 *   POST   /api/geofences
 *   PUT    /api/geofences/:id
 *   DELETE /api/geofences/:id
 *   GET    /api/settings
 *   PUT    /api/settings
 *   GET    /api/alerts
 *   PUT    /api/alerts/:id
 *   GET    /api/health
 */

// ── Suppress PHP errors from leaking into JSON output ─────────────────────────
ini_set('display_errors', 0);
error_reporting(0);

// ── Always output JSON, even for fatal errors ──────────────────────────────────
register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) {
            header('HTTP/1.1 500 Internal Server Error');
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['error' => 'Server error: ' . $err['message']]);
    }
});

// ── Config ────────────────────────────────────────────────────────────────────
$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    header('HTTP/1.1 503 Service Unavailable');
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Server not configured. Please visit /setup.php to install.']);
    exit;
}
require_once $configFile;

// ── CORS & Headers ────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Request Parsing ───────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$path   = trim($_GET['path'] ?? '', '/');
$parts  = ($path !== '') ? explode('/', $path) : [];
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

// ── Database ──────────────────────────────────────────────────────────────────
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]
            );
        } catch (PDOException $e) {
            respond(503, ['error' => 'Database connection failed. Check api/config.php']);
        }
    }
    return $pdo;
}

// ── JWT Helpers ───────────────────────────────────────────────────────────────
function b64url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function b64url_decode(string $data): string
{
    $pad  = strlen($data) % 4;
    $data = $pad ? $data . str_repeat('=', 4 - $pad) : $data;
    return base64_decode(strtr($data, '-_', '+/'));
}

function jwtSign(array $payload): string
{
    $payload['exp'] = time() + JWT_EXPIRE;
    $payload['iat'] = time();
    $h = b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $p = b64url(json_encode($payload));
    $s = b64url(hash_hmac('sha256', "$h.$p", JWT_SECRET, true));
    return "$h.$p.$s";
}

function jwtVerify(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$h, $p, $s] = $parts;
    $expected = b64url(hash_hmac('sha256', "$h.$p", JWT_SECRET, true));
    if (!hash_equals($expected, $s)) return null;
    $data = json_decode(b64url_decode($p), true);
    if (!$data || ($data['exp'] ?? 0) < time()) return null;
    return $data;
}

// ── Response & Auth Helpers ───────────────────────────────────────────────────
function respond(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requireAuth(): array
{
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
        respond(401, ['error' => 'Authentication required']);
    }
    $user = jwtVerify($m[1]);
    if (!$user) respond(401, ['error' => 'Invalid or expired token']);
    return $user;
}

function requireAdminUser(array $user): void
{
    if (($user['type'] ?? '') !== 'admin') {
        respond(403, ['error' => 'Admin access required']);
    }
}

// ── GPS Helpers ───────────────────────────────────────────────────────────────
function haversine(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $R    = 6371000;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a    = sin($dLat / 2) ** 2 +
            cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
    return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
}

function detectFakeGps(array $p): array
{
    $signals = [];
    $acc = $p['accuracy'] ?? null;
    if ($acc !== null && (float)$acc < 1.0) {
        $signals[] = 'accuracy_too_perfect';
    }
    if (!empty($p['last'])) {
        $dist    = haversine(
            (float)$p['last']['lat'], (float)$p['last']['lng'],
            (float)$p['lat'],         (float)$p['lng']
        );
        $timeDiff = max(1, time() - strtotime($p['last']['recorded_at']));
        $speed    = $dist / $timeDiff; // m/s
        if ($speed > 300) { // > 1080 km/h
            $signals[] = 'impossible_speed';
        }
    }
    return ['isFake' => count($signals) > 0, 'signals' => $signals];
}

// ── Router ────────────────────────────────────────────────────────────────────
try {
    $r0     = $parts[0] ?? '';
    $r1     = $parts[1] ?? '';
    $r2     = $parts[2] ?? '';
    $id     = ctype_digit($r1) ? (int)$r1 : null;
    $action = ($id !== null) ? $r2 : $r1;

    switch ($r0) {
        case 'auth':       routeAuth($method, $action, $body);            break;
        case 'employees':  routeEmployees($method, $id, $action, $body);  break;
        case 'attendance': routeAttendance($method, $action, $body);      break;
        case 'geofences':  routeGeofences($method, $id, $body);           break;
        case 'settings':   routeSettings($method, $body);                 break;
        case 'alerts':     routeAlerts($method, $id, $body);              break;
        case 'health':
            respond(200, ['status' => 'ok', 'ts' => date('c'), 'db' => 'connected']);
            break;
        default:
            respond(404, ['error' => 'Route not found']);
    }
} catch (PDOException $e) {
    respond(500, ['error' => 'Database error: ' . $e->getMessage()]);
} catch (Throwable $e) {
    respond(500, ['error' => $e->getMessage()]);
}

// ════════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════════
function routeAuth(string $method, string $action, array $body): void
{
    // POST /auth/login
    if ($method === 'POST' && $action === 'login') {
        $identifier = strtolower(trim($body['email'] ?? ''));
        $pass       = $body['password'] ?? '';

        if (!$identifier || !$pass) {
            respond(400, ['error' => 'البريد الإلكتروني وكلمة المرور مطلوبان']);
        }

        // 1) Check admin_users table
        $stmt = db()->prepare(
            'SELECT * FROM admin_users WHERE email = ? AND active = 1 LIMIT 1'
        );
        $stmt->execute([$identifier]);
        $admin = $stmt->fetch();

        if ($admin && password_verify($pass, $admin['password_hash'])) {
            db()->prepare(
                'UPDATE admin_users SET failed_attempts = 0, last_login = NOW() WHERE id = ?'
            )->execute([$admin['id']]);

            $token = jwtSign([
                'id'    => $admin['id'],
                'name'  => $admin['name'],
                'email' => $admin['email'],
                'role'  => $admin['role'],
                'type'  => 'admin',
            ]);

            respond(200, [
                'token' => $token,
                'user'  => [
                    'id'    => $admin['id'],
                    'name'  => $admin['name'],
                    'email' => $admin['email'],
                    'role'  => $admin['role'],
                ],
            ]);
        }

        // 2) Check employees table (for PWA login — by email or phone)
        $stmt = db()->prepare(
            'SELECT * FROM employees WHERE (email = ? OR phone = ?) AND status = "active" LIMIT 1'
        );
        $stmt->execute([$identifier, $identifier]);
        $emp = $stmt->fetch();

        if ($emp) {
            // Use stored hash if set, otherwise accept default 'karaja123'
            $hashOk = $emp['password_hash']
                ? password_verify($pass, $emp['password_hash'])
                : ($pass === 'karaja123');

            if ($hashOk) {
                $token = jwtSign([
                    'id'         => $emp['id'],
                    'name'       => $emp['name'],
                    'department' => $emp['department'],
                    'geofenceId' => $emp['geofence_id'],
                    'type'       => 'employee',
                ]);

                respond(200, [
                    'token' => $token,
                    'user'  => [
                        'id'         => $emp['id'],
                        'name'       => $emp['name'],
                        'department' => $emp['department'],
                        'geofenceId' => $emp['geofence_id'],
                    ],
                ]);
            }
        }

        respond(401, ['error' => 'بيانات الدخول غير صحيحة']);
    }

    // GET /auth/me
    if ($method === 'GET' && $action === 'me') {
        $user = requireAuth();
        respond(200, ['user' => $user]);
    }

    // POST /auth/logout
    if ($method === 'POST' && $action === 'logout') {
        requireAuth();
        respond(200, ['message' => 'تم تسجيل الخروج بنجاح']);
    }

    respond(404, ['error' => 'Auth route not found']);
}

// ════════════════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ════════════════════════════════════════════════════════════════════════════════
function routeEmployees(string $method, ?int $id, string $action, array $body): void
{
    $user = requireAuth();
    requireAdminUser($user);

    // POST /employees/:id/bind-device
    if ($id && $action === 'bind-device' && $method === 'POST') {
        $deviceId   = trim($body['deviceId'] ?? '');
        $deviceName = $body['deviceName'] ?? null;
        if (!$deviceId) respond(400, ['error' => 'deviceId مطلوب']);

        $chk = db()->prepare('SELECT id FROM employees WHERE device_id = ? AND id != ?');
        $chk->execute([$deviceId, $id]);
        if ($chk->fetch()) respond(409, ['error' => 'هذا الجهاز مرتبط بموظف آخر']);

        db()->prepare(
            'UPDATE employees SET device_id=?, device_name=?, device_bound_at=NOW(), updated_at=NOW() WHERE id=?'
        )->execute([$deviceId, $deviceName, $id]);

        respond(200, ['message' => 'تم ربط الجهاز بنجاح']);
    }

    // DELETE /employees/:id/unbind-device
    if ($id && $action === 'unbind-device' && $method === 'DELETE') {
        db()->prepare(
            'UPDATE employees SET device_id=NULL, device_name=NULL, device_bound_at=NULL, updated_at=NOW() WHERE id=?'
        )->execute([$id]);
        respond(200, ['message' => 'تم إلغاء ربط الجهاز']);
    }

    // GET /employees
    if ($method === 'GET' && !$id) {
        $where = []; $params = [];

        if (!empty($_GET['dept'])) {
            $where[] = 'e.department = ?';
            $params[] = $_GET['dept'];
        }
        if (!empty($_GET['status'])) {
            $where[] = 'e.status = ?';
            $params[] = $_GET['status'];
        }
        if (!empty($_GET['search'])) {
            $s = '%' . $_GET['search'] . '%';
            $where[] = '(e.name LIKE ? OR e.phone LIKE ? OR e.email LIKE ?)';
            $params = array_merge($params, [$s, $s, $s]);
        }

        $w     = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $page  = max(1, (int)($_GET['page'] ?? 1));
        $limit = min(100, max(1, (int)($_GET['limit'] ?? 50)));
        $off   = ($page - 1) * $limit;

        $stmt = db()->prepare(
            "SELECT e.id, e.employee_number, e.name, e.department, e.phone, e.email,
                    e.geofence_id, e.device_id, e.device_name, e.device_bound_at,
                    e.shift_start, e.shift_end, e.status, e.created_at, e.updated_at,
                    g.name AS geofence_name
             FROM employees e
             LEFT JOIN geofences g ON g.id = e.geofence_id
             $w
             ORDER BY e.name ASC
             LIMIT ? OFFSET ?"
        );
        $stmt->execute(array_merge($params, [$limit, $off]));
        $rows = $stmt->fetchAll();

        $cnt = db()->prepare("SELECT COUNT(*) FROM employees e $w");
        $cnt->execute($params);

        respond(200, ['employees' => $rows, 'total' => (int)$cnt->fetchColumn()]);
    }

    // GET /employees/:id
    if ($method === 'GET' && $id) {
        $stmt = db()->prepare(
            'SELECT e.*, g.name AS geofence_name
             FROM employees e
             LEFT JOIN geofences g ON g.id = e.geofence_id
             WHERE e.id = ?'
        );
        $stmt->execute([$id]);
        $emp = $stmt->fetch();
        if (!$emp) respond(404, ['error' => 'الموظف غير موجود']);
        respond(200, $emp);
    }

    // POST /employees
    if ($method === 'POST' && !$id) {
        $name = trim($body['name'] ?? '');
        $dept = trim($body['department'] ?? '');
        if (!$name || !$dept) respond(400, ['error' => 'الاسم والقسم مطلوبان']);

        $defaultHash = password_hash('karaja123', PASSWORD_BCRYPT);
        $stmt = db()->prepare(
            'INSERT INTO employees
                (name, department, phone, email, geofence_id, employee_number,
                 shift_start, shift_end, password_hash)
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        $stmt->execute([
            $name,
            $dept,
            $body['phone']          ?? null,
            $body['email']          ?? null,
            $body['geofenceId']     ?? null,
            $body['employeeNumber'] ?? null,
            $body['shiftStart']     ?? '08:00',
            $body['shiftEnd']       ?? '17:00',
            $defaultHash,
        ]);

        $newId = (int)db()->lastInsertId();
        $row   = db()->prepare(
            'SELECT e.*, g.name AS geofence_name FROM employees e LEFT JOIN geofences g ON g.id=e.geofence_id WHERE e.id=?'
        );
        $row->execute([$newId]);
        respond(201, $row->fetch());
    }

    // PUT /employees/:id
    if ($method === 'PUT' && $id) {
        $fields = []; $params = [];

        foreach (['name', 'department', 'phone', 'email', 'status'] as $f) {
            if (array_key_exists($f, $body)) {
                $fields[] = "$f = ?";
                $params[] = $body[$f];
            }
        }
        if (array_key_exists('geofenceId', $body)) {
            $fields[] = 'geofence_id = ?';
            $params[] = $body['geofenceId'];
        }
        if (array_key_exists('shiftStart', $body)) {
            $fields[] = 'shift_start = ?';
            $params[] = $body['shiftStart'];
        }
        if (array_key_exists('shiftEnd', $body)) {
            $fields[] = 'shift_end = ?';
            $params[] = $body['shiftEnd'];
        }

        if (!$fields) respond(400, ['error' => 'لا توجد حقول للتحديث']);

        $fields[] = 'updated_at = NOW()';
        $params[]  = $id;
        db()->prepare('UPDATE employees SET ' . implode(', ', $fields) . ' WHERE id = ?')
            ->execute($params);

        $stmt = db()->prepare(
            'SELECT e.*, g.name AS geofence_name FROM employees e LEFT JOIN geofences g ON g.id=e.geofence_id WHERE e.id=?'
        );
        $stmt->execute([$id]);
        $emp = $stmt->fetch();
        if (!$emp) respond(404, ['error' => 'الموظف غير موجود']);
        respond(200, $emp);
    }

    // DELETE /employees/:id  (soft delete)
    if ($method === 'DELETE' && $id) {
        db()->prepare(
            'UPDATE employees SET status = "deleted", updated_at = NOW() WHERE id = ?'
        )->execute([$id]);
        respond(200, ['message' => 'تم حذف الموظف']);
    }

    respond(404, ['error' => 'Employee route not found']);
}

// ════════════════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ════════════════════════════════════════════════════════════════════════════════
function routeAttendance(string $method, string $action, array $body): void
{
    // ── Write operations (from employee PWA) ──────────────────────────────────
    if ($method === 'POST' && in_array($action, ['checkin', 'checkout', 'periodic'])) {
        requireAuth(); // employee OR admin token accepted

        $empId    = (int)($body['employeeId'] ?? 0);
        $lat      = (float)($body['lat']      ?? 0);
        $lng      = (float)($body['lng']      ?? 0);
        $deviceId = trim($body['deviceId']    ?? '');

        if (!$empId) respond(400, ['error' => 'employeeId مطلوب']);

        // Load employee + assigned geofence in one query
        $stmt = db()->prepare(
            'SELECT e.*,
                    g.lat AS g_lat, g.lng AS g_lng,
                    g.radius AS g_radius, g.id AS g_id
             FROM employees e
             LEFT JOIN geofences g ON g.id = e.geofence_id AND g.active = 1
             WHERE e.id = ? AND e.status = "active"'
        );
        $stmt->execute([$empId]);
        $emp = $stmt->fetch();
        if (!$emp) respond(404, ['error' => 'الموظف غير موجود أو غير نشط']);

        // Device binding check
        if ($emp['device_id'] && $emp['device_id'] !== $deviceId) {
            respond(403, ['error' => 'هذا الجهاز غير مصرح به لهذا الحساب']);
        }

        // Geofence check
        $inside = false;
        $dist   = null;
        $geoId  = null;
        if ($emp['g_id']) {
            $dist   = (int)round(haversine($lat, $lng, (float)$emp['g_lat'], (float)$emp['g_lng']));
            $inside = $dist <= (int)$emp['g_radius'];
            $geoId  = (int)$emp['g_id'];
        }

        // Fake GPS detection
        $lastStmt = db()->prepare(
            'SELECT lat, lng, recorded_at FROM attendance_logs
             WHERE employee_id = ? ORDER BY recorded_at DESC LIMIT 1'
        );
        $lastStmt->execute([$empId]);
        $lastRec = $lastStmt->fetch() ?: null;

        $gps = detectFakeGps([
            'lat'      => $lat,
            'lng'      => $lng,
            'accuracy' => $body['accuracy'] ?? null,
            'last'     => $lastRec,
        ]);

        $typeMap = ['checkin' => 'check_in', 'checkout' => 'check_out', 'periodic' => 'periodic'];
        $type    = $typeMap[$action];

        // Insert attendance record
        $ins = db()->prepare(
            'INSERT INTO attendance_logs
                (employee_id, type, lat, lng, accuracy, altitude, provider,
                 inside_geofence, distance_from_center, geofence_id,
                 fake_gps_detected, fake_gps_signals, device_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
        );
        $ins->execute([
            $empId, $type, $lat, $lng,
            $body['accuracy'] ?? null,
            $body['altitude'] ?? null,
            $body['provider'] ?? 'pwa',
            $inside ? 1 : 0,
            $dist,
            $geoId,
            $gps['isFake'] ? 1 : 0,
            json_encode($gps['signals']),
            $deviceId ?: null,
        ]);

        // Update live positions table (on every ping)
        $lp = db()->prepare(
            'INSERT INTO live_positions (employee_id, lat, lng, inside_geofence, updated_at)
             VALUES (?,?,?,?,NOW())
             ON DUPLICATE KEY UPDATE
                lat=VALUES(lat), lng=VALUES(lng),
                inside_geofence=VALUES(inside_geofence), updated_at=NOW()'
        );
        $lp->execute([$empId, $lat, $lng, $inside ? 1 : 0]);

        // Create alert if suspicious
        if (!$inside || $gps['isFake']) {
            $alertType = $gps['isFake'] ? 'fake_gps' : 'outside_geofence';
            $msg       = $gps['isFake']
                ? "تم اكتشاف GPS مزيف للموظف: {$emp['name']}"
                : "الموظف {$emp['name']} سجّل الحضور خارج النطاق ({$dist}م)";
            db()->prepare(
                'INSERT INTO alerts (employee_id, type, message, severity) VALUES (?,?,?,?)'
            )->execute([$empId, $alertType, $msg, $gps['isFake'] ? 'high' : 'medium']);
        }

        respond(201, [
            'success'           => true,
            'insideGeofence'    => $inside,
            'distanceFromCenter' => $dist,
            'fakeGpsDetected'   => $gps['isFake'],
            'message'           => $inside
                ? 'تم تسجيل الحضور بنجاح'
                : "تحذير: أنت على بُعد {$dist}م من نطاق عملك",
        ]);
    }

    // ── Read operations (admin only) ──────────────────────────────────────────
    $user = requireAuth();
    requireAdminUser($user);

    // GET /attendance/today
    if ($method === 'GET' && $action === 'today') {
        $row = db()->query(
            'SELECT
               COUNT(DISTINCT CASE WHEN al.type="check_in" THEN al.employee_id END)                               AS present_count,
               COUNT(DISTINCT CASE WHEN al.fake_gps_detected=1 THEN al.employee_id END)                          AS fake_gps_count,
               COUNT(DISTINCT CASE WHEN al.inside_geofence=0 AND al.type="check_in" THEN al.employee_id END)     AS outside_count,
               (SELECT COUNT(*) FROM employees WHERE status="active")                                             AS total_employees
             FROM attendance_logs al
             WHERE DATE(al.recorded_at) = CURDATE()'
        )->fetch();

        $row['absent_count'] = max(0, (int)$row['total_employees'] - (int)$row['present_count']);
        respond(200, $row);
    }

    // GET /attendance/live
    if ($method === 'GET' && $action === 'live') {
        $rows = db()->query(
            'SELECT lp.*, e.name, e.department,
                    g.name AS geofence_name
             FROM live_positions lp
             JOIN employees e ON e.id = lp.employee_id
             LEFT JOIN geofences g ON g.id = e.geofence_id
             WHERE lp.updated_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)'
        )->fetchAll();
        respond(200, ['positions' => $rows]);
    }

    // GET /attendance  (log list with filters)
    if ($method === 'GET') {
        $where  = []; $params = [];

        if (!empty($_GET['date']))       { $where[] = 'DATE(al.recorded_at) = ?'; $params[] = $_GET['date']; }
        if (!empty($_GET['employeeId'])) { $where[] = 'al.employee_id = ?';       $params[] = (int)$_GET['employeeId']; }
        if (!empty($_GET['type']))       { $where[] = 'al.type = ?';              $params[] = $_GET['type']; }

        $w     = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $page  = max(1, (int)($_GET['page']  ?? 1));
        $limit = min(100, (int)($_GET['limit'] ?? 20));
        $off   = ($page - 1) * $limit;

        $stmt = db()->prepare(
            "SELECT al.*, e.name AS employee_name, g.name AS geofence_name
             FROM attendance_logs al
             LEFT JOIN employees e ON e.id = al.employee_id
             LEFT JOIN geofences g ON g.id = al.geofence_id
             $w
             ORDER BY al.recorded_at DESC
             LIMIT ? OFFSET ?"
        );
        $stmt->execute(array_merge($params, [$limit, $off]));
        $rows = $stmt->fetchAll();

        $cnt = db()->prepare("SELECT COUNT(*) FROM attendance_logs al $w");
        $cnt->execute($params);

        respond(200, [
            'logs'  => $rows,
            'total' => (int)$cnt->fetchColumn(),
            'page'  => $page,
            'limit' => $limit,
        ]);
    }

    respond(404, ['error' => 'Attendance route not found']);
}

// ════════════════════════════════════════════════════════════════════════════════
// GEOFENCES
// ════════════════════════════════════════════════════════════════════════════════
function routeGeofences(string $method, ?int $id, array $body): void
{
    $user = requireAuth();

    // GET /geofences — all authenticated users can read
    if ($method === 'GET') {
        $rows = db()->query(
            'SELECT * FROM geofences WHERE active = 1 ORDER BY name ASC'
        )->fetchAll();
        respond(200, ['geofences' => $rows]);
    }

    requireAdminUser($user);

    // POST /geofences
    if ($method === 'POST') {
        $name   = trim($body['name']   ?? '');
        $lat    = $body['lat']    ?? null;
        $lng    = $body['lng']    ?? null;
        $radius = $body['radius'] ?? null;
        if (!$name || $lat === null || $lng === null || !$radius) {
            respond(400, ['error' => 'name و lat و lng و radius مطلوبة']);
        }
        $stmt = db()->prepare(
            'INSERT INTO geofences (name, lat, lng, radius, color) VALUES (?,?,?,?,?)'
        );
        $stmt->execute([$name, (float)$lat, (float)$lng, (int)$radius, $body['color'] ?? '#1a56db']);
        $newId = (int)db()->lastInsertId();
        $row   = db()->prepare('SELECT * FROM geofences WHERE id = ?');
        $row->execute([$newId]);
        respond(201, $row->fetch());
    }

    // PUT /geofences/:id
    if ($method === 'PUT' && $id) {
        $fields = []; $params = [];
        foreach (['name', 'color'] as $f) {
            if (array_key_exists($f, $body)) { $fields[] = "$f = ?"; $params[] = $body[$f]; }
        }
        foreach (['lat', 'lng'] as $f) {
            if (array_key_exists($f, $body)) { $fields[] = "$f = ?"; $params[] = (float)$body[$f]; }
        }
        if (array_key_exists('radius', $body)) { $fields[] = 'radius = ?'; $params[] = (int)$body['radius']; }
        if (array_key_exists('active', $body)) { $fields[] = 'active = ?'; $params[] = $body['active'] ? 1 : 0; }

        if (!$fields) respond(400, ['error' => 'لا توجد حقول للتحديث']);

        $fields[] = 'updated_at = NOW()';
        $params[]  = $id;
        db()->prepare('UPDATE geofences SET ' . implode(', ', $fields) . ' WHERE id = ?')
            ->execute($params);

        $row = db()->prepare('SELECT * FROM geofences WHERE id = ?');
        $row->execute([$id]);
        $geo = $row->fetch();
        if (!$geo) respond(404, ['error' => 'النطاق غير موجود']);
        respond(200, $geo);
    }

    // DELETE /geofences/:id  (soft deactivate)
    if ($method === 'DELETE' && $id) {
        db()->prepare('UPDATE geofences SET active = 0, updated_at = NOW() WHERE id = ?')
            ->execute([$id]);
        respond(200, ['message' => 'تم تعطيل النطاق الجغرافي']);
    }

    respond(404, ['error' => 'Geofence route not found']);
}

// ════════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════════════════
function routeSettings(string $method, array $body): void
{
    $user = requireAuth();
    requireAdminUser($user);

    if ($method === 'GET') {
        $row = db()->query('SELECT * FROM system_settings WHERE id = 1')->fetch();
        respond(200, $row ?: (object)[]);
    }

    if ($method === 'PUT' || $method === 'POST') {
        $allowed = [
            'start_time', 'end_time', 'late_threshold_minutes',
            'periodic_interval_minutes', 'default_radius_m', 'gps_accuracy_m',
            'fake_gps_detection', 'device_binding',
            'notif_email', 'notif_absent', 'notif_outside', 'notif_fake_gps',
        ];
        $fields = []; $params = [];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $body)) { $fields[] = "$f = ?"; $params[] = $body[$f]; }
        }
        if ($fields) {
            $fields[] = 'updated_at = NOW()';
            db()->prepare('UPDATE system_settings SET ' . implode(', ', $fields) . ' WHERE id = 1')
                ->execute($params);
        }
        $row = db()->query('SELECT * FROM system_settings WHERE id = 1')->fetch();
        respond(200, $row);
    }

    respond(404, ['error' => 'Settings route not found']);
}

// ════════════════════════════════════════════════════════════════════════════════
// ALERTS
// ════════════════════════════════════════════════════════════════════════════════
function routeAlerts(string $method, ?int $id, array $body): void
{
    $user = requireAuth();
    requireAdminUser($user);

    // GET /alerts
    if ($method === 'GET') {
        $limit      = min(100, max(1, (int)($_GET['limit'] ?? 20)));
        $unreadOnly = !empty($_GET['unread']);
        $w          = $unreadOnly ? 'WHERE a.is_read = 0' : '';

        $rows = db()->query(
            "SELECT a.*, e.name AS employee_name
             FROM alerts a
             LEFT JOIN employees e ON e.id = a.employee_id
             $w
             ORDER BY a.created_at DESC
             LIMIT $limit"
        )->fetchAll();

        $unreadCount = (int)db()->query(
            'SELECT COUNT(*) FROM alerts WHERE is_read = 0'
        )->fetchColumn();

        respond(200, ['alerts' => $rows, 'total' => count($rows), 'unread' => $unreadCount]);
    }

    // PUT /alerts/:id  (mark single alert as read)
    if ($method === 'PUT' && $id) {
        db()->prepare('UPDATE alerts SET is_read = 1 WHERE id = ?')->execute([$id]);
        respond(200, ['message' => 'تم تحديد التنبيه كمقروء']);
    }

    // POST /alerts  with { markAllRead: true }
    if ($method === 'POST' && !empty($body['markAllRead'])) {
        db()->query('UPDATE alerts SET is_read = 1');
        respond(200, ['message' => 'تم تحديد جميع التنبيهات كمقروءة']);
    }

    respond(404, ['error' => 'Alert route not found']);
}
