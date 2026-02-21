import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../services/auth_service.dart';
import '../services/attendance_service.dart';

enum AttendanceState { notCheckedIn, checkedIn, checkedOut }

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  AttendanceState _attendanceState = AttendanceState.notCheckedIn;
  Map<String, dynamic>? _user;
  bool _loading = false;
  String? _statusMessage;
  bool _insideGeofence = false;
  String _currentTime = '';
  Position? _lastPosition;

  @override
  void initState() {
    super.initState();
    _loadUser();
    _startClock();
    _checkCurrentLocation();
  }

  void _startClock() {
    Future.delayed(Duration.zero, () {
      _updateTime();
      Stream.periodic(const Duration(seconds: 1)).listen((_) {
        if (mounted) _updateTime();
      });
    });
  }

  void _updateTime() {
    final now = DateTime.now();
    setState(() {
      _currentTime =
          '${now.hour.toString().padLeft(2,'0')}:${now.minute.toString().padLeft(2,'0')}:${now.second.toString().padLeft(2,'0')}';
    });
  }

  Future<void> _loadUser() async {
    final user = await AuthService.getUser();
    setState(() => _user = user);
  }

  Future<void> _checkCurrentLocation() async {
    try {
      final err = await AttendanceService.requestLocationPermission();
      if (err != null) return;
      final pos = await AttendanceService.getCurrentPosition();
      setState(() => _lastPosition = pos);
    } catch (_) {}
  }

  Future<void> _handleCheckIn() async {
    setState(() { _loading = true; _statusMessage = null; });
    try {
      final employeeId = _user?['id'] as int? ?? 0;
      final result = await AttendanceService.checkIn(employeeId);

      final inside = result['insideGeofence'] as bool? ?? false;
      final fakeGps = result['fakeGpsDetected'] as bool? ?? false;
      final dist = result['distanceFromCenter'] as int?;

      AttendanceService.startPeriodicTracking(employeeId);

      setState(() {
        _attendanceState = AttendanceState.checkedIn;
        _insideGeofence  = inside;
        _statusMessage   = fakeGps
            ? '⚠️ تحذير: تم رصد GPS مزيف!'
            : inside
              ? '✅ تم تسجيل الحضور بنجاح'
              : '⚠️ أنت خارج نطاق العمل (${dist}م)';
      });
    } catch (e) {
      setState(() => _statusMessage = '❌ $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _handleCheckOut() async {
    setState(() { _loading = true; _statusMessage = null; });
    try {
      final employeeId = _user?['id'] as int? ?? 0;
      await AttendanceService.checkOut(employeeId);
      AttendanceService.stopPeriodicTracking();

      setState(() {
        _attendanceState = AttendanceState.checkedOut;
        _statusMessage   = '✅ تم تسجيل الانصراف بنجاح';
      });
    } catch (e) {
      setState(() => _statusMessage = '❌ $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _logout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('تسجيل الخروج'),
        content: const Text('هل تريد تسجيل الخروج من التطبيق؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(context, true),  child: const Text('خروج', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirm == true) {
      AttendanceService.stopPeriodicTracking();
      await AuthService.logout();
      if (mounted) Navigator.pushReplacementNamed(context, '/login');
    }
  }

  Color get _stateColor {
    switch (_attendanceState) {
      case AttendanceState.notCheckedIn: return Colors.grey;
      case AttendanceState.checkedIn:   return const Color(0xFF0e9f6e);
      case AttendanceState.checkedOut:  return const Color(0xFF1a56db);
    }
  }

  String get _stateLabel {
    switch (_attendanceState) {
      case AttendanceState.notCheckedIn: return 'لم تسجّل حضوراً بعد';
      case AttendanceState.checkedIn:   return 'أنت في الدوام ✅';
      case AttendanceState.checkedOut:  return 'انصرفت لهذا اليوم';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      appBar: AppBar(
        title: const Text('نظام حضور كراجا'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _checkCurrentLocation),
          IconButton(icon: const Icon(Icons.logout),  onPressed: _logout),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // User Card
            _buildUserCard(),
            const SizedBox(height: 16),

            // Time Card
            _buildTimeCard(),
            const SizedBox(height: 16),

            // Status Card
            _buildStatusCard(),
            const SizedBox(height: 16),

            // Location Card
            _buildLocationCard(),
            const SizedBox(height: 24),

            // Action Buttons
            _buildActionButtons(),

            // Status Message
            if (_statusMessage != null) ...[
              const SizedBox(height: 16),
              _buildStatusMessage(),
            ],

            const SizedBox(height: 16),
            // Info note
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.blue.shade200),
              ),
              child: const Row(
                children: [
                  Icon(Icons.info_outline, color: Colors.blue, size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'يتم تسجيل موقعك تلقائياً كل 30 دقيقة أثناء الدوام.',
                      style: TextStyle(fontSize: 12, color: Colors.blue),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUserCard() {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: const Color(0xFF1a56db),
              child: Text(
                (_user?['name'] as String? ?? 'م').substring(0, 1),
                style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _user?['name'] as String? ?? '...',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _user?['department'] as String? ?? '',
                    style: const TextStyle(color: Colors.grey, fontSize: 13),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: _stateColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: _stateColor.withOpacity(0.3)),
              ),
              child: Text(
                _stateLabel,
                style: TextStyle(color: _stateColor, fontSize: 11, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTimeCard() {
    final now = DateTime.now();
    final days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    final months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      color: const Color(0xFF1a56db),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Text(
              _currentTime,
              style: const TextStyle(
                color: Colors.white, fontSize: 48,
                fontWeight: FontWeight.bold, fontFamily: 'Courier',
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${days[now.weekday % 7]}، ${now.day} ${months[now.month - 1]} ${now.year}',
              style: const TextStyle(color: Colors.white70, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusCard() {
    final icons = [Icons.access_time, Icons.check_circle, Icons.exit_to_app];
    final labels = ['غير مسجّل', 'حاضر', 'منصرف'];
    final colors = [Colors.grey, const Color(0xFF0e9f6e), const Color(0xFF1a56db)];
    final idx = _attendanceState.index;

    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icons[idx], color: colors[idx], size: 32),
            const SizedBox(width: 12),
            Text(
              labels[idx],
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: colors[idx]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLocationCard() {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.location_on, color: Color(0xFF1a56db)),
                SizedBox(width: 8),
                Text('الموقع الحالي', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              ],
            ),
            const SizedBox(height: 12),
            if (_lastPosition != null) ...[
              Row(
                children: [
                  Expanded(child: _locationItem('خط العرض', _lastPosition!.latitude.toStringAsFixed(6))),
                  const SizedBox(width: 8),
                  Expanded(child: _locationItem('خط الطول', _lastPosition!.longitude.toStringAsFixed(6))),
                ],
              ),
              const SizedBox(height: 8),
              _locationItem('الدقة', '${_lastPosition!.accuracy.toStringAsFixed(1)} م'),
            ] else
              const Text('جاري تحديد الموقع...', style: TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }

  Widget _locationItem(String label, String value) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey)),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, fontFamily: 'Courier')),
        ],
      ),
    );
  }

  Widget _buildActionButtons() {
    return Column(
      children: [
        // Check-in button
        SizedBox(
          width: double.infinity,
          height: 56,
          child: ElevatedButton.icon(
            onPressed: _loading || _attendanceState == AttendanceState.checkedIn
                ? null
                : _handleCheckIn,
            icon: const Icon(Icons.login),
            label: const Text('تسجيل الحضور', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF0e9f6e),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              disabledBackgroundColor: Colors.grey.shade300,
            ),
          ),
        ),
        const SizedBox(height: 12),
        // Check-out button
        SizedBox(
          width: double.infinity,
          height: 56,
          child: ElevatedButton.icon(
            onPressed: _loading || _attendanceState != AttendanceState.checkedIn
                ? null
                : _handleCheckOut,
            icon: const Icon(Icons.logout),
            label: const Text('تسجيل الانصراف', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFe02424),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              disabledBackgroundColor: Colors.grey.shade300,
            ),
          ),
        ),
        if (_loading) ...[
          const SizedBox(height: 16),
          const CircularProgressIndicator(),
        ],
      ],
    );
  }

  Widget _buildStatusMessage() {
    final isError = _statusMessage!.contains('❌') || _statusMessage!.contains('⚠️');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isError ? Colors.orange.shade50 : Colors.green.shade50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: isError ? Colors.orange.shade300 : Colors.green.shade300),
      ),
      child: Text(
        _statusMessage!,
        style: TextStyle(
          color: isError ? Colors.orange.shade800 : Colors.green.shade800,
          fontWeight: FontWeight.w500,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }
}
