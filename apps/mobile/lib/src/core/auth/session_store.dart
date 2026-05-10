import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'session.dart';

abstract class SessionStore {
  Future<UserSession?> read();
  Future<void> write(UserSession session);
  Future<void> clear();
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore({
    FlutterSecureStorage? storage,
    SessionStore? debugFallback,
    bool? useDebugFallback,
  }) : _storage = storage ?? const FlutterSecureStorage(),
       _debugFallback = (useDebugFallback ?? (kDebugMode && Platform.isMacOS))
           ? (debugFallback ?? FileDebugSessionStore())
           : null;

  static const _key = 'awamir.session';
  final FlutterSecureStorage _storage;
  final SessionStore? _debugFallback;

  @override
  Future<UserSession?> read() async {
    final fallback = _debugFallback;
    if (fallback != null) return fallback.read();

    final raw = await _storage.read(key: _key);
    if (raw == null) return null;
    return UserSession.fromJson(jsonDecode(raw) as Map<String, Object?>);
  }

  @override
  Future<void> write(UserSession session) {
    final fallback = _debugFallback;
    if (fallback != null) return fallback.write(session);

    return _storage.write(key: _key, value: jsonEncode(session.toJson()));
  }

  @override
  Future<void> clear() {
    final fallback = _debugFallback;
    if (fallback != null) return fallback.clear();

    return _storage.delete(key: _key);
  }
}

class FileDebugSessionStore implements SessionStore {
  FileDebugSessionStore({File? file}) : _file = file ?? _defaultFile();

  final File _file;

  @override
  Future<void> clear() async {
    if (await _file.exists()) {
      await _file.delete();
    }
  }

  @override
  Future<UserSession?> read() async {
    if (!await _file.exists()) return null;
    final raw = await _file.readAsString();
    if (raw.trim().isEmpty) return null;
    return UserSession.fromJson(jsonDecode(raw) as Map<String, Object?>);
  }

  @override
  Future<void> write(UserSession session) async {
    await _file.parent.create(recursive: true);
    await _file.writeAsString(jsonEncode(session.toJson()));
  }

  static File _defaultFile() {
    final home = Platform.environment['HOME'];
    final base = home == null || home.isEmpty
        ? Directory.systemTemp.path
        : '$home/Library/Application Support';
    return File('$base/AwamirPlus/debug_session.json');
  }
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
