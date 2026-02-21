# 🏝️ نظام حضور كراجا — Karaja Island Attendance System

نظام متكامل لإدارة الحضور والانصراف الميداني مع Geofencing وكشف GPS المزيف.

---

## هيكل المشروع

```
Karaja Island/
├── index.html                    ← لوحة التحكم (Web Dashboard)
├── assets/
│   ├── css/style.css             ← التصميم الكامل
│   └── js/
│       ├── data.js               ← بيانات تجريبية
│       └── app.js                ← منطق التطبيق
├── backend/                      ← Node.js + Express API
│   ├── server.js
│   ├── package.json
│   ├── .env.example
│   ├── routes/
│   │   ├── auth.js
│   │   ├── attendance.js
│   │   ├── employees.js
│   │   ├── geofences.js
│   │   ├── reports.js
│   │   ├── settings.js
│   │   └── alerts.js
│   ├── middleware/
│   │   ├── auth.js               ← JWT Authentication
│   │   └── audit.js              ← Audit Logging
│   ├── models/
│   │   └── database.js           ← PostgreSQL Pool
│   └── utils/
│       └── gpsVerification.js    ← Geofence + Fake GPS Detection
├── database/
│   └── schema.sql                ← PostgreSQL Schema
└── flutter_app/                  ← Android App (Flutter)
    ├── pubspec.yaml
    └── lib/
        ├── main.dart
        ├── screens/
        │   ├── login_screen.dart
        │   └── home_screen.dart
        └── services/
            ├── auth_service.dart
            ├── api_service.dart
            └── attendance_service.dart
```

---

## تشغيل لوحة التحكم (Dashboard)

افتح `index.html` مباشرة في المتصفح.

**بيانات الدخول التجريبية:**
- البريد: `admin@karaja.com`
- كلمة المرور: `admin123`

---

## تشغيل الخادم (Backend)

```bash
cd backend
cp .env.example .env
# عدّل .env بمعلومات قاعدة البيانات
npm install
npm run dev
```

---

## إعداد قاعدة البيانات (PostgreSQL)

```bash
createdb karaja_attendance
psql -U postgres -d karaja_attendance -f database/schema.sql
```

---

## تشغيل تطبيق Flutter

```bash
cd flutter_app
flutter pub get
flutter run
```

**ملاحظة:** غيّر `baseUrl` في `lib/services/api_service.dart` للإنتاج.

---

## مميزات النظام

| الميزة | الوصف |
|--------|-------|
| ✅ Geofencing | تحقق من وجود الموظف داخل نطاق عمله |
| ✅ Fake GPS Detection | كشف محاولات التلاعب بالموقع (4 إشارات) |
| ✅ Device Binding | ربط الحساب بجهاز واحد فقط |
| ✅ Periodic Tracking | تسجيل دوري كل 30 دقيقة |
| ✅ Real-time Map | خريطة مباشرة لجميع الموظفين |
| ✅ Audit Logs | سجل تدقيق كامل لكل العمليات |
| ✅ Reports | تقارير شهرية، إدارات، مخالفات |
| ✅ JWT Auth | تشفير كامل مع صلاحيات |
| ✅ Rate Limiting | حماية من هجمات Brute Force |

---

## الأمان

- كل طلبات API محمية بـ JWT
- تشفير bcrypt لكلمات المرور
- Helmet.js للحماية من XSS, CSRF
- Rate limiting على نقاط الدخول الحساسة
- Audit log لكل عملية CRUD
