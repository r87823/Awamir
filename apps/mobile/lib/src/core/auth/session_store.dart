import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'session.dart';

abstract class SessionStore {
  Future<UserSession?> read();
  Future<void> write(UserSession session);
  Future<void> clear();
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'awamir.session';
  final FlutterSecureStorage _storage;

  @override
  Future<UserSession?> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return null;
    return UserSession.fromJson(jsonDecode(raw) as Map<String, Object?>);
  }

  @override
  Future<void> write(UserSession session) {
    return _storage.write(key: _key, value: jsonEncode(session.toJson()));
  }

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

class MemorySessionStore implements SessionStore {
  UserSession? session;

  @override
  Future<void> clear() async {
    session = null;
  }

  @override
  Future<UserSession?> read() async => session;

  @override
  Future<void> write(UserSession session) async {
    this.session = session;
  }
}
