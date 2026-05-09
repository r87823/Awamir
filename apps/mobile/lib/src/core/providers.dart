import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'api/backend_repository.dart';
import 'auth/session.dart';
import 'auth/session_store.dart';

final sessionStoreProvider = Provider<SessionStore>((ref) {
  return SecureSessionStore();
});

final apiClientProvider = Provider<AwamirApiClient>((ref) {
  return AwamirApiClient(
    sessionProvider: () => ref.read(authControllerProvider).session,
  );
});

final backendRepositoryProvider = Provider<BackendRepository>((ref) {
  return BackendRepository(ref.watch(apiClientProvider));
});

final authControllerProvider = Provider<AuthController>((ref) {
  return AuthController(ref.read(sessionStoreProvider));
});

class AuthController extends ChangeNotifier {
  AuthController(this._store);

  final SessionStore _store;
  UserSession? _session;
  bool _ready = false;

  UserSession? get session => _session;
  bool get isReady => _ready;
  bool get isAuthenticated => _session != null;

  Future<void> load() async {
    _session = await _store.read();
    _ready = true;
    notifyListeners();
  }

  Future<void> setSession(UserSession session) async {
    _session = session;
    _ready = true;
    await _store.write(session);
    notifyListeners();
  }

  Future<void> signOut() async {
    _session = null;
    await _store.clear();
    notifyListeners();
  }

  bool hasPermission(String permission) =>
      _session?.hasPermission(permission) ?? false;

  bool hasAny(Iterable<String> permissions) =>
      _session?.hasAny(permissions) ?? false;
}
