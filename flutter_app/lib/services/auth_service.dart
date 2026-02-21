import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_service.dart';

class AuthService {
  static const _storage = FlutterSecureStorage();
  static const _tokenKey = 'auth_token';
  static const _userKey  = 'auth_user';

  static Future<bool> isLoggedIn() async {
    final token = await _storage.read(key: _tokenKey);
    return token != null && token.isNotEmpty;
  }

  static Future<String?> getToken() => _storage.read(key: _tokenKey);

  static Future<Map<String, dynamic>?> getUser() async {
    final json = await _storage.read(key: _userKey);
    if (json == null) return null;
    return jsonDecode(json) as Map<String, dynamic>;
  }

  /// Login with email/password — returns error string or null on success
  static Future<String?> login(String email, String password) async {
    try {
      final response = await ApiService.post('/auth/login', {
        'email': email,
        'password': password,
      }, requireAuth: false);

      if (response['token'] != null) {
        await _storage.write(key: _tokenKey, value: response['token'] as String);
        await _storage.write(key: _userKey,  value: jsonEncode(response['user']));
        return null; // success
      }
      return response['error'] ?? 'Login failed';
    } catch (e) {
      return 'Connection error: $e';
    }
  }

  static Future<void> logout() async {
    try {
      await ApiService.post('/auth/logout', {});
    } catch (_) {}
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
  }
}
