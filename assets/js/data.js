/**
 * Mock Data Store — Karaja Island Attendance System
 * In production, this data comes from the Node.js API server.
 */

const DB = {
  // Settings
  settings: {
    startTime: '08:00',
    endTime: '17:00',
    lateThreshold: 15,
    periodicInterval: 30,
    defaultRadius: 200,
    gpsAccuracy: 50,
    fakeGpsDetection: true,
    deviceBinding: true,
    notifications: {
      absent: true,
      outside: true,
      fakeGps: true,
      email: 'admin@karaja.com'
    }
  },

  // Geofences
  geofences: [
    { id: 1, name: 'المقر الرئيسي', lat: 24.7136, lng: 46.6753, radius: 200, color: '#1a56db', active: true },
    { id: 2, name: 'الفرع الشمالي', lat: 24.7250, lng: 46.6500, radius: 150, color: '#0e9f6e', active: true },
    { id: 3, name: 'مستودع الخدمات', lat: 24.7050, lng: 46.6900, radius: 300, color: '#d97706', active: true },
  ],

  // Departments
  departments: ['الإدارة العامة', 'تقنية المعلومات', 'الموارد البشرية', 'المالية', 'العمليات', 'خدمة العملاء'],

  // Employees
  employees: [
    { id: 1, name: 'أحمد محمد السالم',    dept: 'تقنية المعلومات', phone: '0501234567', email: 'ahmed@karaja.com',   deviceId: 'android-a1b2c3', geofenceId: 1, shiftStart: '08:00', shiftEnd: '17:00', status: 'active',   createdAt: '2024-01-15' },
    { id: 2, name: 'فاطمة علي الزهراني',  dept: 'الموارد البشرية', phone: '0557654321', email: 'fatima@karaja.com',  deviceId: 'android-d4e5f6', geofenceId: 1, shiftStart: '08:00', shiftEnd: '17:00', status: 'active',   createdAt: '2024-02-01' },
    { id: 3, name: 'خالد عبدالله الغامدي',dept: 'العمليات',        phone: '0589991234', email: 'khaled@karaja.com',  deviceId: 'android-g7h8i9', geofenceId: 2, shiftStart: '07:00', shiftEnd: '16:00', status: 'active',   createdAt: '2024-01-20' },
    { id: 4, name: 'نورة سعد القحطاني',   dept: 'المالية',         phone: '0543214567', email: 'noura@karaja.com',   deviceId: 'android-j1k2l3', geofenceId: 1, shiftStart: '08:00', shiftEnd: '17:00', status: 'active',   createdAt: '2024-03-10' },
    { id: 5, name: 'محمد أحمد الدوسري',   dept: 'خدمة العملاء',   phone: '0561239876', email: 'mdosari@karaja.com', deviceId: 'android-m4n5o6', geofenceId: 3, shiftStart: '09:00', shiftEnd: '18:00', status: 'active',   createdAt: '2024-02-20' },
    { id: 6, name: 'ريم عمر البلوي',      dept: 'الإدارة العامة', phone: '0504568912', email: 'reem@karaja.com',    deviceId: null,             geofenceId: 1, shiftStart: '08:00', shiftEnd: '17:00', status: 'active',   createdAt: '2024-04-05' },
    { id: 7, name: 'سلطان ناصر الشهري',   dept: 'تقنية المعلومات',phone: '0579998877', email: 'sultan@karaja.com',  deviceId: 'android-p7q8r9', geofenceId: 2, shiftStart: '08:00', shiftEnd: '17:00', status: 'inactive', createdAt: '2024-01-01' },
    { id: 8, name: 'هند محمد العتيبي',    dept: 'العمليات',        phone: '0531237654', email: 'hind@karaja.com',    deviceId: 'android-s1t2u3', geofenceId: 3, shiftStart: '07:00', shiftEnd: '16:00', status: 'active',   createdAt: '2024-03-25' },
  ],

  // Attendance Logs
  attendanceLogs: [],

  // Alerts
  alerts: [
    { id: 1, type: 'danger',  title: 'محاولة GPS مزيف',          desc: 'الموظف: محمد الدوسري - تم رصد GPS مزيف', time: '10:32', read: false },
    { id: 2, type: 'warning', title: 'خروج من نطاق العمل',        desc: 'الموظف: خالد الغامدي - خرج من نطاق الفرع الشمالي', time: '11:15', read: false },
    { id: 3, type: 'warning', title: 'غياب غير مبرر',             desc: 'الموظف: ريم البلوي - لم يسجل حضوراً اليوم', time: '09:05', read: false },
    { id: 4, type: 'info',    title: 'انصراف مبكر',               desc: 'الموظف: نورة القحطاني - انصرفت قبل نهاية الدوام', time: '15:45', read: true },
    { id: 5, type: 'info',    title: 'تسجيل جهاز جديد',           desc: 'طلب ربط جهاز جديد من: سلطان الشهري', time: '08:20', read: true },
  ],

  // Audit Logs
  auditLogs: [
    { id: 1, time: '10:32:14', user: 'النظام',    action: 'كشف GPS مزيف',       details: 'محمد الدوسري - IP Spoofing detected',     ip: '192.168.1.45' },
    { id: 2, time: '09:01:00', user: 'أحمد السالم', action: 'تسجيل حضور',        details: 'check_in - Geofence: المقر الرئيسي',      ip: '10.0.0.12' },
    { id: 3, time: '08:58:30', user: 'admin',      action: 'تسجيل دخول للوحة',  details: 'Dashboard login successful',              ip: '192.168.1.1' },
    { id: 4, time: '08:45:11', user: 'فاطمة الزهراني', action: 'تسجيل حضور',   details: 'check_in - Geofence: المقر الرئيسي',      ip: '10.0.0.23' },
    { id: 5, time: '08:30:05', user: 'النظام',    action: 'تقرير دوري',          details: 'Daily attendance sync completed',         ip: 'Server' },
  ],

  // Generate random attendance logs
  generateLogs() {
    const logs = [];
    const today = new Date();
    const names = this.employees.filter(e => e.status === 'active');
    const types = ['check_in', 'check_out', 'periodic'];

    for (let day = 6; day >= 0; day--) {
      const d = new Date(today);
      d.setDate(d.getDate() - day);
      const dateStr = d.toISOString().split('T')[0];

      names.forEach(emp => {
        const rand = Math.random();
        if (rand > 0.15) { // 85% attendance rate
          const geo = this.geofences.find(g => g.id === emp.geofenceId);
          const lateMin = Math.floor(Math.random() * 20);
          const isLate = lateMin > 15;
          const isOutside = Math.random() < 0.05;
          const isFakeGps = Math.random() < 0.02;

          logs.push({
            id: logs.length + 1,
            employeeId: emp.id,
            employeeName: emp.name,
            type: 'check_in',
            date: dateStr,
            time: `0${8 + (isLate ? 1 : 0)}:${String(lateMin).padStart(2,'0')}`,
            lat: geo ? geo.lat + (Math.random() - 0.5) * 0.002 : 24.71,
            lng: geo ? geo.lng + (Math.random() - 0.5) * 0.002 : 46.67,
            insideGeofence: !isOutside,
            fakeGpsDetected: isFakeGps,
            deviceId: emp.deviceId,
            geofenceName: geo ? geo.name : 'غير محدد'
          });

          // Periodic logs
          for (let h = 0; h < 3; h++) {
            logs.push({
              id: logs.length + 1,
              employeeId: emp.id,
              employeeName: emp.name,
              type: 'periodic',
              date: dateStr,
              time: `${10 + h * 2}:30`,
              lat: geo ? geo.lat + (Math.random() - 0.5) * 0.001 : 24.71,
              lng: geo ? geo.lng + (Math.random() - 0.5) * 0.001 : 46.67,
              insideGeofence: Math.random() > 0.05,
              fakeGpsDetected: false,
              deviceId: emp.deviceId,
              geofenceName: geo ? geo.name : 'غير محدد'
            });
          }

          // Checkout
          const checkoutHour = 16 + Math.floor(Math.random() * 2);
          const checkoutMin = Math.floor(Math.random() * 60);
          logs.push({
            id: logs.length + 1,
            employeeId: emp.id,
            employeeName: emp.name,
            type: 'check_out',
            date: dateStr,
            time: `${checkoutHour}:${String(checkoutMin).padStart(2,'0')}`,
            lat: geo ? geo.lat + (Math.random() - 0.5) * 0.002 : 24.71,
            lng: geo ? geo.lng + (Math.random() - 0.5) * 0.002 : 46.67,
            insideGeofence: true,
            fakeGpsDetected: false,
            deviceId: emp.deviceId,
            geofenceName: geo ? geo.name : 'غير محدد'
          });
        }
      });
    }
    return logs.sort((a,b) => new Date(b.date+' '+b.time) - new Date(a.date+' '+a.time));
  },

  // Live positions (simulated)
  livePositions: {},

  initLivePositions() {
    this.employees.filter(e => e.status === 'active').forEach(emp => {
      const geo = this.geofences.find(g => g.id === emp.geofenceId);
      if (geo) {
        const online = Math.random() > 0.2;
        this.livePositions[emp.id] = {
          employeeId: emp.id,
          name: emp.name,
          dept: emp.dept,
          online,
          lat: online ? geo.lat + (Math.random() - 0.5) * 0.003 : null,
          lng: online ? geo.lng + (Math.random() - 0.5) * 0.003 : null,
          inside: online ? Math.random() > 0.1 : false,
          lastSeen: online ? 'منذ دقيقتين' : 'منذ ساعة',
          geofenceName: geo.name
        };
      }
    });
  },

  getTodayStats() {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = this.attendanceLogs.filter(l => l.date === today && l.type === 'check_in');
    const checkedIn = new Set(todayLogs.map(l => l.employeeId));
    const active = this.employees.filter(e => e.status === 'active');
    const present = checkedIn.size;
    const absent = active.length - present;
    const late = todayLogs.filter(l => parseInt(l.time.split(':')[1]) > 15 || parseInt(l.time.split(':')[0]) > 8).length;
    const outside = Object.values(this.livePositions).filter(p => p.online && !p.inside).length;
    const fake = todayLogs.filter(l => l.fakeGpsDetected).length;

    return { present, absent, late, total: active.length, outside, fake };
  }
};

// Initialize data
DB.attendanceLogs = DB.generateLogs();
DB.initLivePositions();
