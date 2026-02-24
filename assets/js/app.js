/**
 * Karaja Island Attendance System — Dashboard Application
 * Main application logic (SPA)
 */

'use strict';

const App = (() => {

  // ====== STATE ======
  let state = {
    currentPage: 'overview',
    authenticated: false,
    liveMap: null,
    geofenceMap: null,
    liveMarkers: {},
    geofenceCircles: [],
    attendancePage: 1,
    attendancePageSize: 20,
    charts: {},
    refreshInterval: null,
  };

  // ====== INIT ======
  function init() {
    updateClock();
    setInterval(updateClock, 1000);
    setupAuth();
    setupNavigation();
    setupSidebar();
    setupModal();
    setupRefresh();

    // Simulate auto-refresh every 30 seconds
    state.refreshInterval = setInterval(() => {
      if (state.authenticated && state.currentPage === 'overview') {
        loadOverview();
      }
      if (state.authenticated && state.currentPage === 'map') {
        updateLiveMap();
      }
    }, 30000);
  }

  // ====== CLOCK ======
  function updateClock() {
    const el = document.getElementById('current-time');
    if (el) el.textContent = new Date().toLocaleTimeString('ar-SA');
  }

  // ====== API HELPER ======
  async function apiCall(path, method = 'GET', body = null) {
    const token = localStorage.getItem('karaja_admin_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const clean = path.replace(/^\//, '');
    const [pathPart, queryPart] = clean.split('?');
    let url = '/api/index.php?path=' + pathPart;
    if (queryPart) url += '&' + queryPart;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch (_) { throw new Error('خطأ في الخادم — يرجى تحديث الصفحة'); }
    if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
    return data;
  }

  // ====== AUTH ======
  function setupAuth() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl    = document.getElementById('login-error');
      const btn      = form.querySelector('button[type=submit]');

      errEl.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'جارٍ التحقق...';

      try {
        const data = await apiCall('/auth/login', 'POST', { email, password });
        if (data.user && data.user.role !== 'admin') {
          throw new Error('هذه الصفحة للمديرين فقط');
        }
        localStorage.setItem('karaja_admin_token', data.token);
        localStorage.setItem('karaja_admin_user',  JSON.stringify(data.user));
        errEl.classList.add('hidden');
        login(data.user);
      } catch (err) {
        errEl.textContent = err.message || 'بيانات الدخول غير صحيحة';
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'تسجيل الدخول';
      }
    });

    document.getElementById('logout-btn').addEventListener('click', logout);

    // Auto-login if token exists
    const saved = localStorage.getItem('karaja_admin_token');
    if (saved) {
      apiCall('/auth/me').then(data => {
        if (data.user && data.user.role === 'admin') {
          login(data.user);
        } else { localStorage.removeItem('karaja_admin_token'); }
      }).catch(() => localStorage.removeItem('karaja_admin_token'));
    }
  }

  function login(user) {
    state.authenticated = true;
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('dashboard-screen').classList.add('active');
    navigate('overview');
    const name = (user && user.name) ? user.name : 'المدير';
    toast('مرحباً ' + name + ' في نظام كراجا للحضور', 'success');
  }

  function logout() {
    if (!confirm('هل تريد تسجيل الخروج؟')) return;
    localStorage.removeItem('karaja_admin_token');
    localStorage.removeItem('karaja_admin_user');
    state.authenticated = false;
    document.getElementById('dashboard-screen').classList.remove('active');
    document.getElementById('login-screen').classList.add('active');
    toast('تم تسجيل الخروج بنجاح');
  }

  // ====== NAVIGATION ======
  function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        navigate(link.dataset.page);
      });
    });

    document.getElementById('refresh-btn').addEventListener('click', () => {
      loadPage(state.currentPage);
      toast('تم التحديث', 'success');
    });
  }

  function navigate(page) {
    // Update nav
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const activePage = document.getElementById(`page-${page}`);
    if (activePage) activePage.classList.add('active');

    // Update title
    const titles = {
      overview: 'لوحة التحكم الرئيسية',
      employees: 'إدارة الموظفين',
      attendance: 'سجل الحضور والانصراف',
      map: 'الخريطة المباشرة',
      geofences: 'مناطق العمل (Geofencing)',
      reports: 'التقارير',
      alerts: 'التنبيهات',
      audit: 'سجل التدقيق',
      settings: 'الإعدادات',
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    state.currentPage = page;
    loadPage(page);

    // Re-invalidate maps when switching back to map pages
    if (page === 'map' && state.liveMap) {
      setTimeout(() => state.liveMap.invalidateSize(true), 250);
      setTimeout(() => state.liveMap.invalidateSize(true), 700);
    }
    if (page === 'geofences' && state.geofenceMap) {
      setTimeout(() => state.geofenceMap.invalidateSize(true), 250);
      setTimeout(() => state.geofenceMap.invalidateSize(true), 700);
    }
  }

  function loadPage(page) {
    switch(page) {
      case 'overview':   loadOverview();   break;
      case 'employees':  loadEmployees();  break;
      case 'attendance': loadAttendance(); break;
      case 'map':        loadMap();        break;
      case 'geofences':  loadGeofences();  break;
      case 'reports':    loadReports();    break;
      case 'alerts':     loadAlerts();     break;
      case 'audit':      loadAudit();      break;
      case 'settings':   loadSettings();   break;
    }
  }

  // ====== SIDEBAR ======
  function setupSidebar() {
    const sidebar    = document.getElementById('sidebar');
    const main       = document.getElementById('main-content');
    const mapPage    = document.getElementById('page-map');
    const geoPage    = document.getElementById('page-geofences');

    function syncFixedPages(collapsed) {
      const right = collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)';
      mapPage.style.right = right;
      geoPage.style.right = right;
    }

    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      main.classList.toggle('expanded');
      syncFixedPages(sidebar.classList.contains('collapsed'));

      // Re-fit Leaflet maps after sidebar animation (300ms)
      setTimeout(() => {
        if (state.liveMap)     state.liveMap.invalidateSize(true);
        if (state.geofenceMap) state.geofenceMap.invalidateSize(true);
      }, 320);
    });

    // Set initial values
    syncFixedPages(false);
  }

  // ====== OVERVIEW ======
  function loadOverview() {
    const stats = DB.getTodayStats();
    document.getElementById('stat-present').textContent = stats.present;
    document.getElementById('stat-absent').textContent  = stats.absent;
    document.getElementById('stat-late').textContent    = stats.late;
    document.getElementById('stat-total').textContent   = stats.total;
    document.getElementById('stat-outside').textContent = stats.outside;
    document.getElementById('stat-fake').textContent    = stats.fake;

    renderAttendanceChart();
    renderStatusChart(stats);
    renderRecentLogs();
  }

  function renderAttendanceChart() {
    const ctx = document.getElementById('attendance-chart').getContext('2d');
    if (state.charts.attendance) state.charts.attendance.destroy();

    const labels = [];
    const presentData = [];
    const absentData = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('ar-SA', { weekday: 'short', month: 'short', day: 'numeric' }));

      const dayLogs = new Set(
        DB.attendanceLogs
          .filter(l => l.date === dateStr && l.type === 'check_in')
          .map(l => l.employeeId)
      );
      const active = DB.employees.filter(e => e.status === 'active').length;
      presentData.push(dayLogs.size);
      absentData.push(active - dayLogs.size);
    }

    state.charts.attendance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'حاضر', data: presentData, backgroundColor: '#0e9f6e', borderRadius: 6 },
          { label: 'غائب',  data: absentData,  backgroundColor: '#fca5a5', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
      }
    });
  }

  function renderStatusChart(stats) {
    const ctx = document.getElementById('status-chart').getContext('2d');
    if (state.charts.status) state.charts.status.destroy();

    state.charts.status = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['حاضر', 'غائب', 'متأخر', 'خارج النطاق'],
        datasets: [{
          data: [stats.present, stats.absent, stats.late, stats.outside],
          backgroundColor: ['#0e9f6e', '#e02424', '#d97706', '#7c3aed'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 } } }
        },
        cutout: '65%'
      }
    });
  }

  function renderRecentLogs() {
    const body = document.getElementById('recent-logs-body');
    const logs = DB.attendanceLogs.slice(0, 10);
    body.innerHTML = logs.map(log => `
      <tr>
        <td><strong>${log.employeeName}</strong></td>
        <td>${typeLabel(log.type)}</td>
        <td>${log.date} ${log.time}</td>
        <td>${log.geofenceName}</td>
        <td>
          ${log.fakeGpsDetected
            ? '<span class="status-badge badge-danger">GPS مزيف ⚠️</span>'
            : log.insideGeofence
              ? '<span class="status-badge badge-success">داخل النطاق ✅</span>'
              : '<span class="status-badge badge-warning">خارج النطاق ⚠️</span>'
          }
        </td>
      </tr>
    `).join('');
  }

  // ====== EMPLOYEES ======
  function loadEmployees() {
    const body = document.getElementById('employees-body');
    renderEmployeesTable(DB.employees, body);

    document.getElementById('add-employee-btn').onclick = () => showAddEmployeeModal();
    document.getElementById('employee-search').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = DB.employees.filter(emp =>
        emp.name.toLowerCase().includes(q) ||
        emp.dept.toLowerCase().includes(q) ||
        emp.phone.includes(q)
      );
      renderEmployeesTable(filtered, body);
    };
  }

  function renderEmployeesTable(employees, body) {
    body.innerHTML = employees.map(emp => `
      <tr>
        <td>${emp.id}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;">
              ${emp.name.charAt(0)}
            </div>
            <div>
              <div style="font-weight:700;">${emp.name}</div>
              <div style="font-size:11px;color:var(--gray-500);">${emp.email || ''}</div>
            </div>
          </div>
        </td>
        <td>${emp.dept}</td>
        <td dir="ltr">${emp.phone}</td>
        <td>
          ${emp.deviceId
            ? `<span class="status-badge badge-success">مرتبط ✅</span>`
            : `<span class="status-badge badge-gray">غير مرتبط</span>`
          }
        </td>
        <td>
          ${emp.status === 'active'
            ? '<span class="status-badge badge-success">نشط</span>'
            : '<span class="status-badge badge-danger">غير نشط</span>'
          }
        </td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            <button class="btn-secondary btn-sm" onclick="App.showEmployeeDetails(${emp.id})" title="عرض التفاصيل">👁 تفاصيل</button>
            <button class="btn-primary btn-sm" onclick="App.editEmployee(${emp.id})" title="تعديل بيانات الموظف">✏️ تعديل</button>
            <button class="btn-danger" onclick="App.deleteEmployee(${emp.id})" title="حذف الموظف">🗑 حذف</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function showAddEmployeeModal() {
    showModal('إضافة موظف جديد', `
      <form id="add-employee-form">
        <div class="form-group">
          <label>الاسم الكامل</label>
          <input type="text" id="new-name" placeholder="الاسم الكامل" required />
        </div>
        <div class="form-group">
          <label>الإدارة</label>
          <select id="new-dept">
            ${DB.departments.map(d => `<option>${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>رقم الجوال</label>
          <input type="tel" id="new-phone" placeholder="05XXXXXXXX" required />
        </div>
        <div class="form-group">
          <label>منطقة العمل</label>
          <select id="new-geofence">
            ${DB.geofences.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>البريد الإلكتروني</label>
          <input type="email" id="new-email" placeholder="employee@karaja.com" />
        </div>
      </form>
    `, [
      { label: 'إلغاء', class: 'btn-secondary', action: closeModal },
      { label: 'إضافة الموظف', class: 'btn-primary', action: () => {
        const name = document.getElementById('new-name').value;
        if (!name) { toast('يرجى إدخال الاسم', 'error'); return; }
        const newEmp = {
          id: DB.employees.length + 1,
          name,
          dept: document.getElementById('new-dept').value,
          phone: document.getElementById('new-phone').value,
          deviceId: null,
          geofenceId: parseInt(document.getElementById('new-geofence').value),
          status: 'active',
          createdAt: new Date().toISOString().split('T')[0]
        };
        DB.employees.push(newEmp);
        closeModal();
        loadEmployees();
        toast(`تمت إضافة ${name} بنجاح`, 'success');
      }}
    ]);
  }

  function showEmployeeDetails(id) {
    const emp = DB.employees.find(e => e.id === id);
    if (!emp) return;
    const geo = DB.geofences.find(g => g.id === emp.geofenceId);
    const logs = DB.attendanceLogs.filter(l => l.employeeId === id).slice(0, 5);

    showModal(`تفاصيل: ${emp.name}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div><strong>الإدارة:</strong><br/>${emp.dept}</div>
        <div><strong>الجوال:</strong><br/><span dir="ltr">${emp.phone}</span></div>
        <div><strong>منطقة العمل:</strong><br/>${geo ? geo.name : 'غير محددة'}</div>
        <div><strong>الجهاز:</strong><br/>${emp.deviceId ? `<span style="font-size:11px;font-family:monospace;">${emp.deviceId}</span>` : 'لم يُربط بعد'}</div>
        <div><strong>تاريخ الانضمام:</strong><br/>${emp.createdAt}</div>
        <div><strong>الحالة:</strong><br/>${emp.status === 'active' ? '<span class="status-badge badge-success">نشط</span>' : '<span class="status-badge badge-danger">غير نشط</span>'}</div>
      </div>
      <h4 style="margin-bottom:12px;">آخر سجلات الحضور</h4>
      <table class="data-table">
        <thead><tr><th>النوع</th><th>التاريخ</th><th>الوقت</th><th>الحالة</th></tr></thead>
        <tbody>
          ${logs.map(l => `
            <tr>
              <td>${typeLabel(l.type)}</td>
              <td>${l.date}</td>
              <td>${l.time}</td>
              <td>${l.insideGeofence ? '<span class="status-badge badge-success">داخل ✅</span>' : '<span class="status-badge badge-warning">خارج ⚠️</span>'}</td>
            </tr>
          `).join('') || '<tr><td colspan="4" class="loading">لا توجد سجلات</td></tr>'}
        </tbody>
      </table>
    `, [{ label: 'إغلاق', class: 'btn-secondary', action: closeModal }]);
  }

  function toggleEmployeeStatus(id) {
    const emp = DB.employees.find(e => e.id === id);
    if (!emp) return;
    emp.status = emp.status === 'active' ? 'inactive' : 'active';
    loadEmployees();
    toast(`تم ${emp.status === 'active' ? 'تفعيل' : 'تعطيل'} الموظف ${emp.name}`, 'success');
  }

  function editEmployee(id) {
    const emp = DB.employees.find(e => e.id === id);
    if (!emp) return;

    const geofenceOptions = DB.geofences.map(g =>
      `<option value="${g.id}" ${g.id === emp.geofenceId ? 'selected' : ''}>${g.name} (نطاق ${g.radius}م)</option>`
    ).join('');

    const deptOptions = DB.departments.map(d =>
      `<option ${d === emp.dept ? 'selected' : ''}>${d}</option>`
    ).join('');

    showModal(`✏️ تعديل بيانات: ${emp.name}`, `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">

        <div class="form-group" style="margin-bottom:0;">
          <label>الاسم الكامل</label>
          <input type="text" id="edit-emp-name" value="${emp.name}" required />
        </div>

        <div class="form-group" style="margin-bottom:0;">
          <label>الإدارة</label>
          <select id="edit-emp-dept">${deptOptions}</select>
        </div>

        <div class="form-group" style="margin-bottom:0;">
          <label>رقم الجوال</label>
          <input type="tel" id="edit-emp-phone" value="${emp.phone}" dir="ltr" style="text-align:right;" />
        </div>

        <div class="form-group" style="margin-bottom:0;">
          <label>البريد الإلكتروني</label>
          <input type="email" id="edit-emp-email" value="${emp.email || ''}" dir="ltr" style="text-align:right;" placeholder="employee@karaja.com" />
        </div>

        <div class="form-group" style="margin-bottom:0;">
          <label>بداية الدوام</label>
          <input type="time" id="edit-emp-shift-start" value="${emp.shiftStart || '08:00'}" />
        </div>

        <div class="form-group" style="margin-bottom:0;">
          <label>نهاية الدوام</label>
          <input type="time" id="edit-emp-shift-end" value="${emp.shiftEnd || '17:00'}" />
        </div>

        <div class="form-group" style="margin-bottom:0;">
          <label>الحالة</label>
          <select id="edit-emp-status">
            <option value="active" ${emp.status === 'active' ? 'selected' : ''}>نشط</option>
            <option value="inactive" ${emp.status === 'inactive' ? 'selected' : ''}>غير نشط</option>
          </select>
        </div>

      </div>

      <!-- Location section — prominent -->
      <div style="margin-top:18px;padding:16px;background:var(--primary-lt);border-radius:12px;border:1.5px solid rgba(99,102,241,0.2);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:18px;">📍</span>
          <strong style="font-size:14px;color:var(--primary);">منطقة العمل (Geofence)</strong>
        </div>
        <select id="edit-emp-geofence" style="width:100%;padding:10px 13px;border:1.5px solid rgba(99,102,241,0.3);border-radius:8px;font-family:'Cairo',sans-serif;font-size:14px;background:#fff;color:var(--gray-800);">
          <option value="">— بدون منطقة محددة —</option>
          ${geofenceOptions}
        </select>
        <p style="font-size:12px;color:var(--gray-500);margin-top:8px;">
          💡 تغيير المنطقة سيؤثر على جميع عمليات تسجيل الحضور القادمة لهذا الموظف
        </p>
      </div>

      ${emp.deviceId ? `
        <div style="margin-top:14px;padding:12px 14px;background:var(--warning-lt);border-radius:10px;border:1px solid rgba(245,158,11,0.25);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div>
              <span style="font-size:13px;font-weight:700;color:var(--warning);">📱 جهاز مرتبط</span>
              <div style="font-size:11px;font-family:monospace;color:var(--gray-500);margin-top:3px;">${emp.deviceId}</div>
            </div>
            <button type="button" class="btn-danger" id="reset-device-btn"
              onclick="document.getElementById('reset-device-btn').textContent='✅ سيتم الإلغاء عند الحفظ';document.getElementById('reset-device-btn').dataset.reset='1';document.getElementById('reset-device-btn').disabled=true;">
              إلغاء ربط الجهاز
            </button>
          </div>
        </div>
      ` : ''}
    `, [
      { label: 'إلغاء', class: 'btn-secondary', action: closeModal },
      { label: '💾 حفظ التعديلات', class: 'btn-primary', action: () => {
        const name = document.getElementById('edit-emp-name').value.trim();
        if (!name) { toast('يرجى إدخال اسم الموظف', 'error'); return; }

        const oldGeo   = DB.geofences.find(g => g.id === emp.geofenceId);
        const newGeoId = parseInt(document.getElementById('edit-emp-geofence').value) || null;
        const newGeo   = DB.geofences.find(g => g.id === newGeoId);

        emp.name       = name;
        emp.dept       = document.getElementById('edit-emp-dept').value;
        emp.phone      = document.getElementById('edit-emp-phone').value.trim();
        emp.email      = document.getElementById('edit-emp-email').value.trim();
        emp.shiftStart = document.getElementById('edit-emp-shift-start').value;
        emp.shiftEnd   = document.getElementById('edit-emp-shift-end').value;
        emp.status     = document.getElementById('edit-emp-status').value;
        emp.geofenceId = newGeoId;

        const resetBtn = document.getElementById('reset-device-btn');
        if (resetBtn && resetBtn.dataset.reset === '1') {
          emp.deviceId = null;
        }

        // Audit log entry
        const geoChanged = oldGeo?.id !== newGeoId;
        DB.auditLogs.unshift({
          time: new Date().toLocaleString('ar-SA'),
          user: 'admin@karaja.com',
          action: 'تعديل بيانات موظف',
          details: geoChanged
            ? `${name} — تغيير الموقع من "${oldGeo?.name || 'غير محدد'}" إلى "${newGeo?.name || 'غير محدد'}"`
            : `${name} — تحديث البيانات`,
          ip: '127.0.0.1'
        });

        closeModal();
        loadEmployees();
        toast(`✅ تم تحديث بيانات ${name}${geoChanged ? ` — الموقع: ${newGeo?.name || 'بدون موقع'}` : ''}`, 'success');
      }}
    ]);
  }

  function deleteEmployee(id) {
    const emp = DB.employees.find(e => e.id === id);
    if (!emp) return;

    const logCount = DB.attendanceLogs.filter(l => l.employeeId === id).length;

    showModal('🗑 حذف موظف', `
      <div style="text-align:center;padding:12px 0 20px;">
        <div style="font-size:52px;margin-bottom:16px;">⚠️</div>
        <p style="font-size:16px;font-weight:800;color:var(--gray-900);margin-bottom:8px;">
          هل أنت متأكد من حذف الموظف؟
        </p>
        <p style="font-size:18px;font-weight:900;color:var(--danger);margin-bottom:16px;">
          ${emp.name}
        </p>
        <div style="background:var(--danger-lt);border:1.5px solid rgba(239,68,68,0.2);border-radius:10px;padding:14px;text-align:right;">
          <div style="font-size:13px;font-weight:700;color:var(--danger);margin-bottom:6px;">سيتم حذف:</div>
          <div style="font-size:13px;color:var(--gray-700);line-height:1.8;">
            • بيانات الموظف الأساسية<br/>
            • ربط الجهاز (${emp.deviceId ? 'جهاز مرتبط' : 'لا يوجد جهاز'})<br/>
            • <strong>${logCount} سجل حضور مرتبط</strong>
          </div>
        </div>
        <p style="margin-top:12px;font-size:12px;color:var(--gray-500);">هذا الإجراء لا يمكن التراجع عنه</p>
      </div>
    `, [
      { label: 'إلغاء — لا أريد الحذف', class: 'btn-secondary', action: closeModal },
      { label: '🗑 نعم، احذف الموظف', class: 'btn-danger', action: () => {
        // Remove from employees list
        const idx = DB.employees.indexOf(emp);
        DB.employees.splice(idx, 1);

        // Remove related attendance logs
        DB.attendanceLogs = DB.attendanceLogs.filter(l => l.employeeId !== id);

        // Audit log
        DB.auditLogs.unshift({
          time: new Date().toLocaleString('ar-SA'),
          user: 'admin@karaja.com',
          action: 'حذف موظف',
          details: `${emp.name} — ${emp.dept} — تم حذف ${logCount} سجل`,
          ip: '127.0.0.1'
        });

        closeModal();
        loadEmployees();
        toast(`تم حذف الموظف ${emp.name} وجميع سجلاته`, 'warning');
      }}
    ]);
  }

  // ====== ATTENDANCE ======
  function loadAttendance() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('filter-date').value = today;

    const empSelect = document.getElementById('filter-employee');
    empSelect.innerHTML = '<option value="">جميع الموظفين</option>' +
      DB.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');

    document.getElementById('filter-btn').onclick = () => renderAttendanceTable();
    document.getElementById('export-btn').onclick = () => exportAttendanceCSV();

    renderAttendanceTable();
  }

  function renderAttendanceTable() {
    const dateFilter = document.getElementById('filter-date').value;
    const empFilter  = document.getElementById('filter-employee').value;
    const typeFilter = document.getElementById('filter-type').value;

    let logs = DB.attendanceLogs;
    if (dateFilter) logs = logs.filter(l => l.date === dateFilter);
    if (empFilter)  logs = logs.filter(l => l.employeeId == empFilter);
    if (typeFilter) logs = logs.filter(l => l.type === typeFilter);

    const total = logs.length;
    const start = (state.attendancePage - 1) * state.attendancePageSize;
    const page  = logs.slice(start, start + state.attendancePageSize);

    const body = document.getElementById('attendance-body');
    body.innerHTML = page.length ? page.map(log => `
      <tr>
        <td><strong>${log.employeeName}</strong></td>
        <td>${typeLabel(log.type)}</td>
        <td>${log.date}</td>
        <td>${log.time}</td>
        <td dir="ltr" style="font-size:11px;font-family:monospace;">${log.lat?.toFixed(5)}, ${log.lng?.toFixed(5)}</td>
        <td>${log.insideGeofence
          ? '<span class="status-badge badge-success">نعم ✅</span>'
          : '<span class="status-badge badge-danger">لا ❌</span>'}</td>
        <td>${log.fakeGpsDetected
          ? '<span class="status-badge badge-danger">مزيف 🚨</span>'
          : '<span class="status-badge badge-success">سليم ✅</span>'}</td>
        <td style="font-size:11px;font-family:monospace;">${(log.deviceId || 'N/A').slice(-8)}</td>
      </tr>
    `).join('') : '<tr><td colspan="8" class="loading">لا توجد سجلات للفلتر المحدد</td></tr>';

    renderPagination(total, '#attendance-pagination', (p) => {
      state.attendancePage = p;
      renderAttendanceTable();
    });
  }

  function renderPagination(total, selector, onPage) {
    const pages = Math.ceil(total / state.attendancePageSize);
    const container = document.querySelector(selector);
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= pages; i++) {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (i === state.attendancePage ? ' active' : '');
      btn.textContent = i;
      btn.onclick = () => { state.attendancePage = i; onPage(i); };
      container.appendChild(btn);
    }
  }

  function exportAttendanceCSV() {
    const logs = DB.attendanceLogs;
    const headers = ['الموظف', 'النوع', 'التاريخ', 'الوقت', 'داخل النطاق', 'GPS مزيف', 'الجهاز'];
    const rows = logs.map(l => [
      l.employeeName, typeLabel(l.type), l.date, l.time,
      l.insideGeofence ? 'نعم' : 'لا',
      l.fakeGpsDetected ? 'نعم' : 'لا',
      l.deviceId || 'N/A'
    ]);

    const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast('تم تصدير البيانات', 'success');
  }

  // ====== MAP ======
  function loadMap() {
    setTimeout(() => {
      if (!state.liveMap) {
        state.liveMap = L.map('live-map', { zoomControl: true })
          .setView([24.7136, 46.6753], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
        }).addTo(state.liveMap);

        // Draw geofences on map
        DB.geofences.forEach(geo => {
          L.circle([geo.lat, geo.lng], {
            radius: geo.radius,
            color: geo.color,
            fillColor: geo.color,
            fillOpacity: 0.15,
            weight: 2
          }).addTo(state.liveMap).bindPopup(`<strong>${geo.name}</strong><br>نطاق: ${geo.radius}م`);
        });
      }

      // Force Leaflet to recalculate map size (double call for reliability)
      setTimeout(() => state.liveMap.invalidateSize(true), 200);
      setTimeout(() => state.liveMap.invalidateSize(true), 600);
      updateLiveMap();
    }, 150);
  }

  function updateLiveMap() {
    const listEl = document.getElementById('live-employees-list');
    listEl.innerHTML = '';

    // Update live positions simulation
    DB.initLivePositions();

    Object.values(DB.livePositions).forEach(pos => {
      // Sidebar item
      const item = document.createElement('div');
      item.className = 'live-employee-item';
      item.innerHTML = `
        <div class="employee-dot ${pos.online ? (pos.inside ? 'dot-present' : 'dot-outside') : 'dot-offline'}"></div>
        <div>
          <div style="font-weight:600;font-size:12px;">${pos.name}</div>
          <div style="font-size:11px;color:var(--gray-500);">${pos.online ? (pos.inside ? 'داخل النطاق' : 'خارج النطاق ⚠️') : 'غير متصل'}</div>
          <div style="font-size:10px;color:var(--gray-400);">${pos.lastSeen}</div>
        </div>
      `;
      if (pos.online && state.liveMap) {
        item.onclick = () => state.liveMap.setView([pos.lat, pos.lng], 16);
      }
      listEl.appendChild(item);

      // Map marker
      if (pos.online && state.liveMap) {
        if (state.liveMarkers[pos.employeeId]) {
          state.liveMarkers[pos.employeeId].remove();
        }
        const color = pos.inside ? '#0e9f6e' : '#d97706';
        const icon = L.divIcon({
          html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
          className: '',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });
        state.liveMarkers[pos.employeeId] = L.marker([pos.lat, pos.lng], { icon })
          .addTo(state.liveMap)
          .bindPopup(`
            <strong>${pos.name}</strong><br>
            ${pos.dept}<br>
            <span style="color:${color}">${pos.inside ? '✅ داخل النطاق' : '⚠️ خارج النطاق'}</span><br>
            آخر تحديث: ${pos.lastSeen}
          `);
      }
    });
  }

  // ====== GEOFENCES ======
  function loadGeofences() {
    setTimeout(() => {
      if (!state.geofenceMap) {
        state.geofenceMap = L.map('geofence-map').setView([24.7136, 46.6753], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
        }).addTo(state.geofenceMap);
      }

      setTimeout(() => state.geofenceMap.invalidateSize(), 100);
      renderGeofenceList();
      renderGeofencesOnMap();

      document.getElementById('add-geofence-btn').onclick = () => showAddGeofenceModal();
    }, 150);
  }

  function renderGeofenceList() {
    const list = document.getElementById('geofences-list');
    list.innerHTML = DB.geofences.map(geo => `
      <div class="geofence-item" onclick="App.focusGeofence(${geo.id})">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="geofence-name">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${geo.color};margin-left:6px;"></span>
            ${geo.name}
          </div>
          <span class="status-badge ${geo.active ? 'badge-success' : 'badge-gray'}">${geo.active ? 'نشط' : 'معطل'}</span>
        </div>
        <div class="geofence-radius">النطاق: ${geo.radius} متر</div>
        <div style="margin-top:8px;display:flex;gap:6px;">
          <button class="btn-secondary btn-sm" onclick="App.editGeofence(${geo.id});event.stopPropagation()">تعديل</button>
          <button class="btn-danger" onclick="App.deleteGeofence(${geo.id});event.stopPropagation()">حذف</button>
        </div>
      </div>
    `).join('');
  }

  function renderGeofencesOnMap() {
    state.geofenceCircles.forEach(c => c.remove());
    state.geofenceCircles = [];

    DB.geofences.forEach(geo => {
      const circle = L.circle([geo.lat, geo.lng], {
        radius: geo.radius,
        color: geo.color,
        fillColor: geo.color,
        fillOpacity: 0.2,
        weight: 2
      }).addTo(state.geofenceMap)
        .bindPopup(`<strong>${geo.name}</strong><br>نطاق: ${geo.radius}م`);

      const marker = L.marker([geo.lat, geo.lng])
        .addTo(state.geofenceMap)
        .bindPopup(`<strong>${geo.name}</strong><br>نطاق: ${geo.radius}م`);

      state.geofenceCircles.push(circle, marker);
    });
  }

  function focusGeofence(id) {
    const geo = DB.geofences.find(g => g.id === id);
    if (geo && state.geofenceMap) {
      state.geofenceMap.setView([geo.lat, geo.lng], 15);
    }
  }

  function showAddGeofenceModal() {
    showModal('إضافة منطقة عمل', `
      <div class="form-group">
        <label>اسم المنطقة</label>
        <input type="text" id="geo-name" placeholder="مثال: المقر الرئيسي" />
      </div>
      <div class="form-group">
        <label>خط العرض (Latitude)</label>
        <input type="number" id="geo-lat" step="0.0001" placeholder="24.7136" />
      </div>
      <div class="form-group">
        <label>خط الطول (Longitude)</label>
        <input type="number" id="geo-lng" step="0.0001" placeholder="46.6753" />
      </div>
      <div class="form-group">
        <label>نصف القطر (متر)</label>
        <input type="number" id="geo-radius" value="200" min="50" max="5000" />
      </div>
      <p style="font-size:12px;color:var(--gray-500);margin-top:8px;">
        💡 يمكنك الحصول على الإحداثيات من خرائط جوجل
      </p>
    `, [
      { label: 'إلغاء', class: 'btn-secondary', action: closeModal },
      { label: 'إضافة', class: 'btn-primary', action: () => {
        const name = document.getElementById('geo-name').value;
        const lat  = parseFloat(document.getElementById('geo-lat').value);
        const lng  = parseFloat(document.getElementById('geo-lng').value);
        const radius = parseInt(document.getElementById('geo-radius').value);

        if (!name || isNaN(lat) || isNaN(lng)) {
          toast('يرجى ملء جميع الحقول', 'error'); return;
        }

        const colors = ['#1a56db','#0e9f6e','#d97706','#7c3aed','#dc2626'];
        DB.geofences.push({
          id: DB.geofences.length + 1,
          name, lat, lng, radius,
          color: colors[DB.geofences.length % colors.length],
          active: true
        });
        closeModal();
        renderGeofenceList();
        renderGeofencesOnMap();
        toast(`تمت إضافة ${name}`, 'success');
      }}
    ]);
  }

  function editGeofence(id) {
    const geo = DB.geofences.find(g => g.id === id);
    if (!geo) return;
    showModal(`تعديل: ${geo.name}`, `
      <div class="form-group">
        <label>اسم المنطقة</label>
        <input type="text" id="edit-geo-name" value="${geo.name}" />
      </div>
      <div class="form-group">
        <label>نصف القطر (متر)</label>
        <input type="number" id="edit-geo-radius" value="${geo.radius}" min="50" max="5000" />
      </div>
    `, [
      { label: 'إلغاء', class: 'btn-secondary', action: closeModal },
      { label: 'حفظ', class: 'btn-primary', action: () => {
        geo.name   = document.getElementById('edit-geo-name').value;
        geo.radius = parseInt(document.getElementById('edit-geo-radius').value);
        closeModal();
        renderGeofenceList();
        renderGeofencesOnMap();
        toast('تم تحديث المنطقة', 'success');
      }}
    ]);
  }

  function deleteGeofence(id) {
    const geo = DB.geofences.find(g => g.id === id);
    if (!geo || !confirm(`هل تريد حذف "${geo.name}"؟`)) return;
    DB.geofences.splice(DB.geofences.indexOf(geo), 1);
    renderGeofenceList();
    renderGeofencesOnMap();
    toast('تم حذف المنطقة', 'success');
  }

  // ====== REPORTS ======
  function loadReports() {
    document.getElementById('report-output').classList.add('hidden');
  }

  function generateReport(type) {
    const output = document.getElementById('report-output');
    const title  = document.getElementById('report-title');
    const content = document.getElementById('report-content');
    output.classList.remove('hidden');

    const reportMap = {
      monthly: { title: 'التقرير الشهري', fn: buildMonthlyReport },
      employee: { title: 'تقرير الموظفين', fn: buildEmployeeReport },
      department: { title: 'تقرير الإدارات', fn: buildDeptReport },
      violations: { title: 'تقرير المخالفات', fn: buildViolationsReport }
    };

    const r = reportMap[type];
    title.textContent = r.title;
    content.innerHTML = r.fn();
    output.scrollIntoView({ behavior: 'smooth' });
  }

  function buildMonthlyReport() {
    const active = DB.employees.filter(e => e.status === 'active');
    return `
      <table class="data-table">
        <thead><tr><th>الموظف</th><th>الإدارة</th><th>أيام الحضور</th><th>أيام الغياب</th><th>متوسط وقت الوصول</th></tr></thead>
        <tbody>
          ${active.map(emp => {
            const logs = DB.attendanceLogs.filter(l => l.employeeId === emp.id && l.type === 'check_in');
            const daysPresent = new Set(logs.map(l => l.date)).size;
            const daysAbsent = 22 - daysPresent;
            return `<tr>
              <td>${emp.name}</td>
              <td>${emp.dept}</td>
              <td><span class="status-badge badge-success">${daysPresent}</span></td>
              <td><span class="status-badge ${daysAbsent > 3 ? 'badge-danger' : 'badge-warning'}">${Math.max(0, daysAbsent)}</span></td>
              <td>08:${Math.floor(Math.random()*15).toString().padStart(2,'0')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function buildEmployeeReport() {
    return buildMonthlyReport();
  }

  function buildDeptReport() {
    return `
      <table class="data-table">
        <thead><tr><th>الإدارة</th><th>عدد الموظفين</th><th>نسبة الحضور</th><th>حالات GPS مزيف</th></tr></thead>
        <tbody>
          ${DB.departments.map(dept => {
            const emps = DB.employees.filter(e => e.dept === dept && e.status === 'active');
            const rate = emps.length ? (85 + Math.floor(Math.random() * 15)) : 0;
            return `<tr>
              <td>${dept}</td>
              <td>${emps.length}</td>
              <td><span class="status-badge ${rate >= 90 ? 'badge-success' : rate >= 75 ? 'badge-warning' : 'badge-danger'}">${rate}%</span></td>
              <td>${Math.floor(Math.random() * 3)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  function buildViolationsReport() {
    const violations = DB.attendanceLogs.filter(l => l.fakeGpsDetected || !l.insideGeofence);
    return violations.length ? `
      <table class="data-table">
        <thead><tr><th>الموظف</th><th>التاريخ</th><th>الوقت</th><th>نوع المخالفة</th></tr></thead>
        <tbody>
          ${violations.map(v => `<tr>
            <td>${v.employeeName}</td>
            <td>${v.date}</td>
            <td>${v.time}</td>
            <td>${v.fakeGpsDetected
              ? '<span class="status-badge badge-danger">GPS مزيف 🚨</span>'
              : '<span class="status-badge badge-warning">خارج النطاق ⚠️</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p style="text-align:center;padding:24px;color:var(--gray-400);">لا توجد مخالفات</p>';
  }

  function exportReport() {
    toast('جاري تصدير التقرير...', 'success');
  }

  // ====== ALERTS ======
  function loadAlerts() {
    const list = document.getElementById('alerts-list');
    const badge = document.getElementById('alerts-badge');

    renderAlerts(list);
    badge.textContent = DB.alerts.filter(a => !a.read).length;

    document.getElementById('mark-all-read').onclick = () => {
      DB.alerts.forEach(a => a.read = true);
      renderAlerts(list);
      badge.textContent = '0';
      toast('تم تحديد جميع التنبيهات كمقروءة');
    };
  }

  function renderAlerts(list) {
    list.innerHTML = DB.alerts.map(alert => `
      <div class="alert-item alert-${alert.type} ${alert.read ? '' : 'unread'}">
        <div class="alert-icon">${alert.type === 'danger' ? '🚨' : alert.type === 'warning' ? '⚠️' : 'ℹ️'}</div>
        <div class="alert-content">
          <div class="alert-title">${alert.title}</div>
          <div class="alert-desc">${alert.desc}</div>
          <div class="alert-time">اليوم - ${alert.time}</div>
        </div>
        ${!alert.read ? `<button class="btn-secondary btn-sm" onclick="App.markAlertRead(${alert.id})">تحديد كمقروء</button>` : ''}
      </div>
    `).join('');
  }

  function markAlertRead(id) {
    const alert = DB.alerts.find(a => a.id === id);
    if (alert) alert.read = true;
    loadAlerts();
  }

  // ====== AUDIT ======
  function loadAudit() {
    const body = document.getElementById('audit-body');
    body.innerHTML = DB.auditLogs.map(log => `
      <tr>
        <td style="font-family:monospace;font-size:12px;">${log.time}</td>
        <td>${log.user}</td>
        <td><strong>${log.action}</strong></td>
        <td style="font-size:12px;color:var(--gray-500);">${log.details}</td>
        <td style="font-family:monospace;font-size:11px;direction:ltr;">${log.ip}</td>
      </tr>
    `).join('');
  }

  // ====== SETTINGS ======
  function loadSettings() {
    const s = DB.settings;
    document.getElementById('setting-start-time').value = s.startTime;
    document.getElementById('setting-end-time').value   = s.endTime;
    document.getElementById('setting-late-threshold').value = s.lateThreshold;
    document.getElementById('setting-periodic').value   = s.periodicInterval;
    document.getElementById('setting-radius').value     = s.defaultRadius;
    document.getElementById('setting-gps-accuracy').value = s.gpsAccuracy;
    document.getElementById('setting-fake-gps').checked = s.fakeGpsDetection;
    document.getElementById('setting-device-binding').checked = s.deviceBinding;
    document.getElementById('notif-absent').checked     = s.notifications.absent;
    document.getElementById('notif-outside').checked    = s.notifications.outside;
    document.getElementById('notif-fake-gps').checked   = s.notifications.fakeGps;
    document.getElementById('notif-email').value        = s.notifications.email;

    document.getElementById('save-attendance-settings').onclick = () => {
      s.startTime        = document.getElementById('setting-start-time').value;
      s.endTime          = document.getElementById('setting-end-time').value;
      s.lateThreshold    = parseInt(document.getElementById('setting-late-threshold').value);
      s.periodicInterval = parseInt(document.getElementById('setting-periodic').value);
      toast('تم حفظ إعدادات الحضور', 'success');
    };

    document.getElementById('save-geo-settings').onclick = () => {
      s.defaultRadius     = parseInt(document.getElementById('setting-radius').value);
      s.gpsAccuracy       = parseInt(document.getElementById('setting-gps-accuracy').value);
      s.fakeGpsDetection  = document.getElementById('setting-fake-gps').checked;
      s.deviceBinding     = document.getElementById('setting-device-binding').checked;
      toast('تم حفظ إعدادات الجيوفنسينج', 'success');
    };

    document.getElementById('save-notif-settings').onclick = () => {
      s.notifications.absent   = document.getElementById('notif-absent').checked;
      s.notifications.outside  = document.getElementById('notif-outside').checked;
      s.notifications.fakeGps  = document.getElementById('notif-fake-gps').checked;
      s.notifications.email    = document.getElementById('notif-email').value;
      toast('تم حفظ إعدادات الإشعارات', 'success');
    };
  }

  // ====== REFRESH ======
  function setupRefresh() {
    // Placeholder
  }

  // ====== MODAL ======
  function setupModal() {
    document.getElementById('modal-close').onclick = closeModal;
    document.getElementById('modal-overlay').onclick = (e) => {
      if (e.target === document.getElementById('modal-overlay')) closeModal();
    };
  }

  function showModal(title, bodyHTML, buttons = []) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    const footer = document.getElementById('modal-footer');
    footer.innerHTML = '';
    buttons.forEach(btn => {
      const b = document.createElement('button');
      b.className = btn.class;
      b.textContent = btn.label;
      b.onclick = btn.action;
      footer.appendChild(b);
    });
    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  // ====== TOAST ======
  function toast(message, type = '') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span> ${message}`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ====== HELPERS ======
  function typeLabel(type) {
    return { check_in: '🟢 حضور', check_out: '🔴 انصراف', periodic: '🔵 دوري' }[type] || type;
  }

  // ====== PUBLIC API ======
  return {
    init,
    navigate,
    showEmployeeDetails,
    toggleEmployeeStatus,
    editEmployee,
    deleteEmployee,
    focusGeofence,
    editGeofence,
    deleteGeofence,
    generateReport,
    exportReport,
    markAlertRead,
    toast,
  };

})();

// Boot
document.addEventListener('DOMContentLoaded', App.init);
