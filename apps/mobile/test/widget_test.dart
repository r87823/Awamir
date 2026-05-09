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
