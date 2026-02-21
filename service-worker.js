/**
 * Karaja Attendance — Service Worker
 * Handles: offline caching, background sync, push notifications
 */

const CACHE_NAME    = 'karaja-v1';
const API_BASE      = 'https://api.karaja-attendance.com/api';

// Files to cache for offline use
const STATIC_ASSETS = [
  '/employee.html',
  '/assets/css/employee.css',
  '/assets/js/employee.js',
  '/assets/js/data.js',
  '/manifest.json',
];

// ── Install: pre-cache static assets ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Cache-first for static, Network-first for API ──────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, and API requests
  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);

      // Return cached immediately if available, update in background
      return cached || network;
    })
  );
});

// ── Background Sync: retry failed attendance submissions ──────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncPendingAttendance());
  }
});

async function syncPendingAttendance() {
  const db = await openIDB();
  const pending = await getAllFromIDB(db, 'pendingLogs');

  for (const log of pending) {
    try {
      const token = await getFromIDB(db, 'auth', 'token');
      const response = await fetch(`${API_BASE}/attendance/${log.type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token?.value || ''}`,
        },
        body: JSON.stringify(log.data),
      });

      if (response.ok) {
        await deleteFromIDB(db, 'pendingLogs', log.id);
        // Notify clients of successful sync
        self.clients.matchAll().then(clients => {
          clients.forEach(client =>
            client.postMessage({ type: 'SYNC_SUCCESS', log: log.data })
          );
        });
      }
    } catch {
      // Will retry on next sync
    }
  }
}

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); }
  catch { data = { title: 'كراجا للحضور', body: event.data.text() }; }

  const options = {
    body:    data.body   || 'لديك إشعار جديد',
    icon:    '/assets/icons/icon-192.png',
    badge:   '/assets/icons/icon-72.png',
    tag:     data.tag    || 'karaja-notif',
    vibrate: [200, 100, 200],
    dir:     'rtl',
    lang:    'ar',
    data:    { url: data.url || '/employee.html' },
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'كراجا للحضور', options)
  );
});

// ── Notification click: open app ──────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/employee.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes('employee.html'));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

// ── Periodic Background Sync (Chrome Android only) ───────────────────────────
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'periodic-attendance') {
    event.waitUntil(sendPeriodicPing());
  }
});

async function sendPeriodicPing() {
  try {
    const db = await openIDB();
    const token  = await getFromIDB(db, 'auth', 'token');
    const empId  = await getFromIDB(db, 'auth', 'employeeId');
    if (!token || !empId) return;

    const pos = await getPosition();
    if (!pos) return;

    await fetch(`${API_BASE}/attendance/periodic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        employeeId: empId.value,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        provider: 'pwa',
      }),
    });
  } catch {
    // Silent fail — will retry
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPosition() {
  return new Promise(resolve =>
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true, timeout: 15000
    })
  );
}

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('KarajaDB', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('auth'))
        db.createObjectStore('auth', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('pendingLogs'))
        db.createObjectStore('pendingLogs', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function getFromIDB(db, store, key) {
  return new Promise((resolve) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => resolve(null);
  });
}

function getAllFromIDB(db, store) {
  return new Promise((resolve) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => resolve([]);
  });
}

function deleteFromIDB(db, store, key) {
  return new Promise((resolve) => {
    const tx  = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = resolve;
  });
}
