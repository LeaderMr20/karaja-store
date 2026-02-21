/**
 * Karaja Attendance — Employee PWA
 * Works on iOS Safari + Android Chrome
 */

'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = ''; // Empty = same origin (relative URLs via service worker)
// For production: 'https://api.karaja-attendance.com/api'

const SHIFT = { start: '08:00', end: '17:00' };

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  employee: null,
  token: null,
  checkedIn: false,
  checkedOut: false,
  currentPos: null,
  geofence: null,
  insideGeofence: null,
  todayLogs: [],
  gpsWatchId: null,
  clockInterval: null,
  periodicInterval: null,
  online: navigator.onLine,
};

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  registerSW();
  setupOnlineDetection();
  updateClock();
  state.clockInterval = setInterval(updateClock, 1000);
  showIOSInstallHint();

  const saved = loadAuth();
  if (saved) {
    state.employee = saved.employee;
    state.token    = saved.token;
    showHome();
  }

  setupLogin();
  setupButtons();
});

// ── Service Worker ────────────────────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        // Listen for sync success messages
        navigator.serviceWorker.addEventListener('message', (e) => {
          if (e.data?.type === 'SYNC_SUCCESS') {
            showResult('تم إرسال السجل المحفوظ بنجاح ✅', 'success');
          }
        });

        // Register periodic background sync (Chrome Android)
        if ('periodicSync' in reg) {
          reg.periodicSync.register('periodic-attendance', { minInterval: 30 * 60 * 1000 })
            .catch(() => {}); // iOS doesn't support this — handled via foreground timer
        }
      })
      .catch(() => {});
  }
}

// ── Online/Offline detection ──────────────────────────────────────────────────
function setupOnlineDetection() {
  const badge = document.getElementById('offline-badge');

  function update() {
    state.online = navigator.onLine;
    badge.classList.toggle('hidden', state.online);
  }

  window.addEventListener('online',  () => { update(); syncPending(); });
  window.addEventListener('offline', update);
  update();
}

// ── iOS Install Hint ──────────────────────────────────────────────────────────
function showIOSInstallHint() {
  const isIOS       = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;

  if (isIOS && !isStandalone) {
    document.getElementById('install-hint').style.display = 'block';
  }
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');

  if (timeEl) {
    timeEl.textContent =
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  if (dateEl) {
    const days   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    dateEl.textContent = `${days[now.getDay()]}، ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function saveAuth(employee, token) {
  localStorage.setItem('karaja_emp',   JSON.stringify(employee));
  localStorage.setItem('karaja_token', token);
}

function loadAuth() {
  const emp   = localStorage.getItem('karaja_emp');
  const token = localStorage.getItem('karaja_token');
  if (emp && token) return { employee: JSON.parse(emp), token };
  return null;
}

function clearAuth() {
  localStorage.removeItem('karaja_emp');
  localStorage.removeItem('karaja_token');
}

// ── Login ─────────────────────────────────────────────────────────────────────
function setupLogin() {
  const form = document.getElementById('login-form');
  const pass = document.getElementById('login-pass');
  const togglePass = document.getElementById('toggle-pass');

  togglePass.addEventListener('click', () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    togglePass.textContent = show ? '🙈' : '👁';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('login-id').value.trim();
    const pw = document.getElementById('login-pass').value;
    const errEl = document.getElementById('login-error');
    const btn   = document.getElementById('login-btn');

    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<div style="width:18px;height:18px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto;"></div>';

    try {
      // Demo mode: accept any @karaja.com email with password 'karaja123'
      if ((id.includes('@') || /^\d+$/.test(id)) && pw === 'karaja123') {
        const demoEmployee = {
          id: 1,
          name: id.includes('@') ? id.split('@')[0] : `موظف ${id}`,
          department: 'الإدارة العامة',
          geofenceId: 1,
        };
        state.employee = demoEmployee;
        state.token    = 'demo-token';
        saveAuth(demoEmployee, 'demo-token');
        showHome();
      } else {
        // Real API call
        const res = await fetchAPI('/auth/login', 'POST', { email: id, password: pw }, false);
        state.employee = res.user;
        state.token    = res.token;
        saveAuth(res.user, res.token);
        showHome();
      }
    } catch (err) {
      errEl.textContent = err.message || 'فشل تسجيل الدخول';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>دخول</span>';
    }
  });
}

// ── Home ──────────────────────────────────────────────────────────────────────
function showHome() {
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');

  // Fill employee info
  const emp = state.employee;
  const initial = (emp.name || 'م').charAt(0);
  document.getElementById('emp-avatar').textContent = initial;
  document.getElementById('emp-name').textContent   = emp.name || 'موظف';
  document.getElementById('emp-dept').textContent   = emp.department || '';

  // Shift times
  document.getElementById('shift-start').textContent = SHIFT.start;
  document.getElementById('shift-end').textContent   = SHIFT.end;

  updateAttendanceStatus('absent');
  startGPS();
  loadTodayLogs();
  startPeriodicTimer();
}

function setupButtons() {
  document.getElementById('btn-checkin').addEventListener('click', handleCheckIn);
  document.getElementById('btn-checkout').addEventListener('click', handleCheckOut);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
}

// ── Attendance Status ─────────────────────────────────────────────────────────
function updateAttendanceStatus(status) {
  const dot   = document.getElementById('status-dot');
  const text  = document.getElementById('status-text');
  const cin   = document.getElementById('btn-checkin');
  const cout  = document.getElementById('btn-checkout');

  dot.className  = 'status-dot ' + status;

  switch (status) {
    case 'present':
      text.textContent = 'أنت في الدوام الآن ✅';
      cin.disabled  = true;
      cout.disabled = false;
      state.checkedIn  = true;
      state.checkedOut = false;
      break;
    case 'checkedout':
      text.textContent = 'انصرفت لهذا اليوم 🏠';
      cin.disabled  = true;
      cout.disabled = true;
      state.checkedIn  = false;
      state.checkedOut = true;
      break;
    default: // absent
      text.textContent = 'لم تسجّل حضوراً بعد';
      cin.disabled  = false;
      cout.disabled = true;
      state.checkedIn  = false;
      state.checkedOut = false;
  }
}

// ── GPS ───────────────────────────────────────────────────────────────────────
function startGPS() {
  if (!('geolocation' in navigator)) {
    setGeofenceStatus('unknown', '⚠️ GPS غير متاح في هذا الجهاز');
    return;
  }

  // Enable checkin button once we have GPS (even before position)
  document.getElementById('btn-checkin').disabled = state.checkedIn || state.checkedOut;

  const options = {
    enableHighAccuracy: true,
    maximumAge: 30000,
    timeout: 20000,
  };

  state.gpsWatchId = navigator.geolocation.watchPosition(
    onPositionUpdate,
    onPositionError,
    options
  );
}

function onPositionUpdate(pos) {
  state.currentPos = pos;

  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const acc = pos.coords.accuracy;

  document.getElementById('gps-coords').textContent =
    `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  document.getElementById('gps-accuracy').textContent =
    `±${Math.round(acc)}م`;

  // Geofence check (demo: المقر الرئيسي at 24.7136, 46.6753, r=200m)
  const fence = { lat: 24.7136, lng: 46.6753, radius: 200, name: 'المقر الرئيسي' };
  const dist  = haversine(lat, lng, fence.lat, fence.lng);
  state.insideGeofence = dist <= fence.radius;
  state.geofence = fence;

  if (state.insideGeofence) {
    setGeofenceStatus('inside', `✅ داخل نطاق ${fence.name} (${Math.round(dist)}م)`);
  } else {
    setGeofenceStatus('outside', `⚠️ خارج النطاق — أبعد بـ ${Math.round(dist)}م`);
  }
}

function onPositionError(err) {
  const msgs = {
    1: 'تم رفض إذن الموقع — يرجى السماح من الإعدادات',
    2: 'تعذّر تحديد الموقع',
    3: 'انتهت مهلة تحديد الموقع',
  };
  setGeofenceStatus('unknown', '⚠️ ' + (msgs[err.code] || 'خطأ في GPS'));
}

function setGeofenceStatus(cls, msg) {
  const el = document.getElementById('geofence-status');
  el.className = 'geofence-status ' + cls;
  el.textContent = msg;
}

// ── Check-in ──────────────────────────────────────────────────────────────────
async function handleCheckIn() {
  if (!state.currentPos) {
    showResult('⚠️ يرجى انتظار تحديد موقعك أولاً', 'warning');
    return;
  }

  showLoading('جاري تسجيل الحضور...');

  const payload = buildPayload('check_in');

  try {
    let result;
    if (state.online) {
      result = await fetchAPI('/attendance/checkin', 'POST', payload);
    } else {
      await savePending('checkin', payload);
      result = { insideGeofence: state.insideGeofence, offline: true };
    }

    updateAttendanceStatus('present');
    addLogItem({ type: 'check_in', time: now(), inside: result.insideGeofence });

    const msg = result.offline
      ? '📴 تم حفظ الحضور — سيُرسل عند الاتصال'
      : result.insideGeofence
        ? '✅ تم تسجيل الحضور بنجاح'
        : `⚠️ حضور مسجّل — أنت خارج النطاق`;

    showResult(msg, result.insideGeofence || result.offline ? 'success' : 'warning');

  } catch (err) {
    showResult('❌ ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ── Check-out ─────────────────────────────────────────────────────────────────
async function handleCheckOut() {
  const confirmed = confirm('هل تريد تسجيل الانصراف الآن؟');
  if (!confirmed) return;

  showLoading('جاري تسجيل الانصراف...');

  const payload = buildPayload('check_out');

  try {
    if (state.online) {
      await fetchAPI('/attendance/checkout', 'POST', payload);
    } else {
      await savePending('checkout', payload);
    }

    updateAttendanceStatus('checkedout');
    addLogItem({ type: 'check_out', time: now(), inside: state.insideGeofence });
    stopPeriodicTimer();

    showResult('✅ تم تسجيل الانصراف. إلى اللقاء!', 'success');

  } catch (err) {
    showResult('❌ ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ── Periodic Timer (foreground — iOS fallback) ────────────────────────────────
function startPeriodicTimer() {
  stopPeriodicTimer();
  // Every 30 minutes while app is open
  state.periodicInterval = setInterval(sendPeriodicPing, 30 * 60 * 1000);
}

function stopPeriodicTimer() {
  if (state.periodicInterval) clearInterval(state.periodicInterval);
  state.periodicInterval = null;
}

async function sendPeriodicPing() {
  if (!state.checkedIn || !state.currentPos) return;
  const payload = buildPayload('periodic');
  try {
    if (state.online) {
      await fetchAPI('/attendance/periodic', 'POST', payload);
    } else {
      await savePending('periodic', payload);
    }
    addLogItem({ type: 'periodic', time: now(), inside: state.insideGeofence });
  } catch {
    // Silent
  }
}

// ── Today's logs ──────────────────────────────────────────────────────────────
function loadTodayLogs() {
  const stored = localStorage.getItem('karaja_today_logs');
  if (stored) {
    const today = new Date().toISOString().split('T')[0];
    const data  = JSON.parse(stored);
    if (data.date === today) {
      state.todayLogs = data.logs;
      renderLogs();
      // Restore attendance state
      const hasCheckIn  = data.logs.some(l => l.type === 'check_in');
      const hasCheckOut = data.logs.some(l => l.type === 'check_out');
      if (hasCheckOut)     updateAttendanceStatus('checkedout');
      else if (hasCheckIn) updateAttendanceStatus('present');
    }
  }
}

function addLogItem(log) {
  state.todayLogs.unshift(log);
  saveLogs();
  renderLogs();
}

function saveLogs() {
  localStorage.setItem('karaja_today_logs', JSON.stringify({
    date: new Date().toISOString().split('T')[0],
    logs: state.todayLogs,
  }));
}

function renderLogs() {
  const container = document.getElementById('today-log-list');
  if (!state.todayLogs.length) {
    container.innerHTML = '<div class="log-empty">لا توجد تسجيلات بعد</div>';
    return;
  }

  const typeInfo = {
    check_in:  { label: 'حضور',   cls: 'log-checkin' },
    check_out: { label: 'انصراف', cls: 'log-checkout' },
    periodic:  { label: 'دوري',   cls: 'log-periodic' },
  };

  container.innerHTML = state.todayLogs.map(log => {
    const info = typeInfo[log.type] || { label: log.type, cls: '' };
    return `
      <div class="log-item ${info.cls}">
        <div class="log-type-dot"></div>
        <div class="log-info">
          <div class="log-type-label">${info.label}</div>
          <div class="log-time">${log.time}</div>
        </div>
        <span class="log-geo ${log.inside ? 'in' : 'out'}">
          ${log.inside ? 'داخل ✅' : 'خارج ⚠️'}
        </span>
      </div>
    `;
  }).join('');
}

// ── Logout ────────────────────────────────────────────────────────────────────
function handleLogout() {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  clearAuth();
  if (state.gpsWatchId) navigator.geolocation.clearWatch(state.gpsWatchId);
  stopPeriodicTimer();
  clearInterval(state.clockInterval);
  document.getElementById('screen-home').classList.remove('active');
  document.getElementById('screen-login').classList.add('active');
  state.employee = null;
  state.token    = null;
}

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchAPI(path, method = 'GET', body = null, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.token) headers['Authorization'] = `Bearer ${state.token}`;

  const res = await fetch(API_BASE + '/api' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Offline pending queue ─────────────────────────────────────────────────────
async function savePending(type, data) {
  const key     = `karaja_pending_${Date.now()}`;
  const pending = JSON.parse(localStorage.getItem('karaja_pending') || '[]');
  pending.push({ key, type, data, savedAt: new Date().toISOString() });
  localStorage.setItem('karaja_pending', JSON.stringify(pending));

  // Register background sync (Chrome)
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('sync-attendance').catch(() => {});
  }
}

async function syncPending() {
  const pending = JSON.parse(localStorage.getItem('karaja_pending') || '[]');
  if (!pending.length || !state.online) return;

  const remaining = [];
  for (const item of pending) {
    try {
      await fetchAPI(`/attendance/${item.type}`, 'POST', item.data);
    } catch {
      remaining.push(item);
    }
  }
  localStorage.setItem('karaja_pending', JSON.stringify(remaining));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildPayload(type) {
  const pos = state.currentPos;
  return {
    employeeId: state.employee?.id || 0,
    type,
    lat:      pos?.coords.latitude  || 0,
    lng:      pos?.coords.longitude || 0,
    accuracy: pos?.coords.accuracy  || null,
    altitude: pos?.coords.altitude  || null,
    provider: 'pwa',
    deviceId: getDeviceId(),
  };
}

function getDeviceId() {
  let id = localStorage.getItem('karaja_device_id');
  if (!id) {
    id = 'pwa-' + Math.random().toString(36).slice(2) + '-' + Date.now();
    localStorage.setItem('karaja_device_id', id);
  }
  return id;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = d => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function now() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function showLoading(text = 'جاري المعالجة...') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

function showResult(msg, type = 'success') {
  const el = document.getElementById('result-banner');
  el.textContent = msg;
  el.className   = `result-banner ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}
