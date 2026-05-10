import 'dart:io';

import 'package:awamir_plus_mobile/main.dart';
import 'package:awamir_plus_mobile/src/core/api/api_error.dart';
import 'package:awamir_plus_mobile/src/core/api/backend_repository.dart';
import 'package:awamir_plus_mobile/src/core/api/api_client.dart';
import 'package:awamir_plus_mobile/src/core/api/paged_response.dart';
import 'package:awamir_plus_mobile/src/core/auth/permission_guard.dart';
import 'package:awamir_plus_mobile/src/core/auth/session.dart';
import 'package:awamir_plus_mobile/src/core/auth/session_store.dart';
import 'package:awamir_plus_mobile/src/core/providers.dart';
import 'package:awamir_plus_mobile/src/core/routing/app_router.dart';
import 'package:awamir_plus_mobile/src/features/dashboard/dashboard_screen.dart';
import 'package:awamir_plus_mobile/src/features/notifications/notifications_screen.dart';
import 'package:awamir_plus_mobile/src/features/orders/orders_list_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('app boots and shows login', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionStoreProvider.overrideWithValue(MemorySessionStore()),
        ],
        child: const AwamirPlusApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('أوامر بلس'), findsOneWidget);
  });

  test('parses backend API error shape with correlationId', () {
    final error = ApiError.fromJson({
      'code': 'FORBIDDEN',
      'message': 'Missing required permission',
      'details': {
        'requiredPermissions': ['orders:view'],
      },
      'correlationId': 'corr-test',
      'timestamp': '2026-05-10T00:00:00.000Z',
    });

    expect(error.code, 'FORBIDDEN');
    expect(error.supportMessage, contains('corr-test'));
  });

  test(
    'macOS debug session fallback stores session without secure storage',
    () async {
      final tempDir = await Directory.systemTemp.createTemp(
        'awamir-session-store-test',
      );
      addTearDown(() => tempDir.delete(recursive: true));
      final store = SecureSessionStore(
        useDebugFallback: true,
        debugFallback: FileDebugSessionStore(
          file: File('${tempDir.path}/session.json'),
        ),
      );
      const session = UserSession(
        token: 'jwt-token',
        actorId: 'actor',
        displayName: 'مستخدم',
        permissions: {'orders:view'},
        branchIds: ['branch-1'],
      );

      await store.write(session);
      final saved = await store.read();
      await store.clear();

      expect(saved?.token, 'jwt-token');
      expect(saved?.branchIds, ['branch-1']);
      expect(await store.read(), isNull);
    },
  );

  testWidgets('PermissionGuard hides unauthorized actions', (tester) async {
    final store = MemorySessionStore()
      ..session = const UserSession(
        token: 'token',
        actorId: 'actor',
        displayName: 'مستخدم',
        permissions: {'orders:view'},
      );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sessionStoreProvider.overrideWithValue(store)],
        child: const MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: PermissionGuard(
              permissions: ['orders:approve'],
              fallback: Text('مخفي'),
              child: Text('اعتماد'),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('اعتماد'), findsNothing);
    expect(find.text('مخفي'), findsOneWidget);
  });

  testWidgets('route guard redirects unauthenticated users to login', (
    tester,
  ) async {
    final auth = AuthController(MemorySessionStore());
    await auth.load();
    await tester.pumpWidget(
      MaterialApp.router(routerConfig: createAppRouter(auth)..go('/orders')),
    );
    await tester.pumpAndSettle();

    expect(find.byType(OrdersListScreen), findsNothing);
    expect(find.text('أوامر بلس'), findsOneWidget);
  });

  testWidgets('orders list renders happy path', (tester) async {
    final store = MemorySessionStore()
      ..session = const UserSession(
        token: 'token',
        actorId: 'actor',
        displayName: 'مستخدم',
        permissions: {'orders:view'},
      );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sessionStoreProvider.overrideWithValue(store),
          backendRepositoryProvider.overrideWithValue(FakeOrdersRepository()),
        ],
        child: const MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: OrdersListScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('ORD-1'), findsOneWidget);
    expect(find.textContaining('عميل'), findsOneWidget);
  });

  testWidgets('dashboard shows unread notifications badge', (tester) async {
    final auth = AuthController(MemorySessionStore());
    await auth.setSession(
      const UserSession(
        token: 'token',
        actorId: 'actor',
        displayName: 'مستخدم',
        permissions: {'notifications:view'},
      ),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authControllerProvider.overrideWithValue(auth),
          backendRepositoryProvider.overrideWithValue(
            FakeNotificationsRepository(),
          ),
        ],
        child: const MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: DashboardScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('التنبيهات'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('notifications screen lists and marks read', (tester) async {
    final repo = FakeNotificationsRepository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [backendRepositoryProvider.overrideWithValue(repo)],
        child: const MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: NotificationsScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('تنبيه طلب'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.done));
    await tester.pumpAndSettle();
    expect(repo.markedRead, 'notif-1');
    expect(find.text('تم تحديث التنبيه'), findsOneWidget);
  });
}

class FakeOrdersRepository extends BackendRepository {
  FakeOrdersRepository() : super(AwamirApiClient(baseUrl: 'http://localhost'));

  @override
  Future<PagedResponse> orders({String? status}) async {
    return PagedResponse.fromJson({
      'data': [
        {
          'id': 'order-1',
          'orderNumber': 'ORD-1',
          'customerName': 'عميل',
          'status': 'DRAFT',
        },
      ],
      'page': 1,
      'pageSize': 20,
      'total': 1,
    });
  }
}

class FakeNotificationsRepository extends FakeOrdersRepository {
  String? markedRead;

  @override
  Future<int> unreadNotificationsCount() async => 2;

  @override
  Future<PagedResponse> notifications({
    bool unreadOnly = false,
    String? type,
  }) async {
    return PagedResponse.fromJson({
      'data': [
        {
          'id': 'notif-1',
          'type': 'ORDER_APPROVED',
          'title': 'تنبيه طلب',
          'body': 'تم تحديث الطلب',
          'entityType': 'order',
          'entityId': 'order-1',
          'readAt': null,
        },
      ],
      'page': 1,
      'pageSize': 20,
      'total': 1,
    });
  }

  @override
  Future<Map<String, Object?>> markNotificationRead(String id) async {
    markedRead = id;
    return {'id': id, 'readAt': DateTime.now().toIso8601String()};
  }

  @override
  Future<int> markAllNotificationsRead() async => 1;
}
