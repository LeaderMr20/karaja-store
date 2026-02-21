import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'api_service.dart';

class AttendanceService {
  static Timer? _periodicTimer;

  /// Request location permissions, returns error string or null
  static Future<String?> requestLocationPermission() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return 'خدمة GPS غير مفعّلة. يرجى تفعيلها من الإعدادات.';

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return 'تم رفض إذن الموقع.';
      }
    }
    if (permission == LocationPermission.deniedForever) {
      return 'إذن الموقع محظور دائماً. يرجى التعديل من الإعدادات.';
    }
    return null;
  }

  /// Get current position with high accuracy
  static Future<Position> getCurrentPosition() async {
    return await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.best,
      timeLimit: const Duration(seconds: 20),
    );
  }

  /// Get device ID for device binding
  static Future<String> getDeviceId() async {
    final info = DeviceInfoPlugin();
    final android = await info.androidInfo;
    return android.id; // Hardware-backed unique ID
  }

  /// Check-in
  static Future<Map<String, dynamic>> checkIn(int employeeId) async {
    final permError = await requestLocationPermission();
    if (permError != null) throw Exception(permError);

    final pos = await getCurrentPosition();
    final deviceId = await getDeviceId();

    return await ApiService.post('/attendance/checkin', {
      'employeeId': employeeId,
      'lat': pos.latitude,
      'lng': pos.longitude,
      'accuracy': pos.accuracy,
      'altitude': pos.altitude,
      'provider': 'fused',
      'deviceId': deviceId,
    });
  }

  /// Check-out
  static Future<Map<String, dynamic>> checkOut(int employeeId) async {
    final permError = await requestLocationPermission();
    if (permError != null) throw Exception(permError);

    final pos = await getCurrentPosition();
    final deviceId = await getDeviceId();

    return await ApiService.post('/attendance/checkout', {
      'employeeId': employeeId,
      'lat': pos.latitude,
      'lng': pos.longitude,
      'accuracy': pos.accuracy,
      'altitude': pos.altitude,
      'provider': 'fused',
      'deviceId': deviceId,
    });
  }

  /// Start periodic pings every 30 minutes
  static void startPeriodicTracking(int employeeId) {
    _periodicTimer?.cancel();
    _periodicTimer = Timer.periodic(const Duration(minutes: 30), (_) async {
      try {
        final pos = await getCurrentPosition();
        final deviceId = await getDeviceId();
        await ApiService.post('/attendance/periodic', {
          'employeeId': employeeId,
          'lat': pos.latitude,
          'lng': pos.longitude,
          'accuracy': pos.accuracy,
          'altitude': pos.altitude,
          'provider': 'fused',
          'deviceId': deviceId,
        });
      } catch (e) {
        // Log silently; periodic pings should not crash the app
        print('[Periodic] Error: $e');
      }
    });
  }

  /// Stop periodic tracking (on check-out)
  static void stopPeriodicTracking() {
    _periodicTimer?.cancel();
    _periodicTimer = null;
  }
}
