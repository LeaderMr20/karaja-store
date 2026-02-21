import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiService {
  static const String baseUrl = 'https://api.karaja-attendance.com/api';
  // For local dev use: 'http://10.0.2.2:3000/api'

  static const _storage = FlutterSecureStorage();
  static const Duration _timeout = Duration(seconds: 15);

  static Future<String?> _getToken() => _storage.read(key: 'auth_token');

  static Future<Map<String, String>> _headers({bool requireAuth = true}) async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (requireAuth) {
      final token = await _getToken();
      if (token != null) headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  static Future<Map<String, dynamic>> get(String path) async {
    final response = await http
      .get(Uri.parse('$baseUrl$path'), headers: await _headers())
      .timeout(_timeout);
    return _handle(response);
  }

  static Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body, {
    bool requireAuth = true,
  }) async {
    final response = await http
      .post(
        Uri.parse('$baseUrl$path'),
        headers: await _headers(requireAuth: requireAuth),
        body: jsonEncode(body),
      )
      .timeout(_timeout);
    return _handle(response);
  }

  static Future<Map<String, dynamic>> put(String path, Map<String, dynamic> body) async {
    final response = await http
      .put(
        Uri.parse('$baseUrl$path'),
        headers: await _headers(),
        body: jsonEncode(body),
      )
      .timeout(_timeout);
    return _handle(response);
  }

  static Map<String, dynamic> _handle(http.Response response) {
    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded;
    }
    throw ApiException(
      decoded['error'] ?? 'Unknown error',
      response.statusCode,
    );
  }
}

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, this.statusCode);
  @override
  String toString() => 'ApiException($statusCode): $message';
}
