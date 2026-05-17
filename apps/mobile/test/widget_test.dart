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
import 'package:awamir_plus_mobile/src/features/admin/admin_user_form_screen.dart';
import 'package:awamir_plus_mobile/src/features/dashboard/dashboard_screen.dart';
import 'package:awamir_plus_mobile/src/features/orders/create_order_screen.dart';
import 'package:awamir_plus_mobile/src/features/notifications/notifications_screen.dart';
import 'package:awamir_plus_mobile/src/features/orders/orders_list_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

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

  test('parses admin users paged response shape', () {
    final page = PagedResponse.fromJson({
      'users': [
        {'id': 'user-1', 'username': 'branch_operator_01'},
      ],
      'page': 1,
      'pageSize': 20,
      'total': 1,
    });

    expect(page.data.single['username'], 'branch_operator_01');
    expect(page.total, 1);
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

  testWidgets('create order screen loads active products', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          backendRepositoryProvider.overrideWithValue(FakeOrdersRepository()),
        ],
        child: const MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: CreateOrderScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('FATAYER_SPINACH'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'معرف المنتج'), findsNothing);
    expect(find.byTooltip('رجوع'), findsOneWidget);
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

  testWidgets('dashboard hides admin tile without admin permissions', (
    tester,
  ) async {
    final auth = AuthController(MemorySessionStore());
    await auth.setSession(
      const UserSession(
        token: 'token',
        actorId: 'actor',
        displayName: 'مستخدم',
        permissions: {'orders:view'},
      ),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authControllerProvider.overrideWithValue(auth),
          backendRepositoryProvider.overrideWithValue(FakeOrdersRepository()),
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

    expect(find.text('الإدارة'), findsNothing);
  });

  testWidgets('dashboard shows admin tile with admin permission', (
    tester,
  ) async {
    final auth = AuthController(MemorySessionStore());
    await auth.setSession(
      const UserSession(
        token: 'token',
        actorId: 'actor',
        displayName: 'مدير',
        permissions: {'admin.users.view'},
      ),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authControllerProvider.overrideWithValue(auth),
          backendRepositoryProvider.overrideWithValue(FakeOrdersRepository()),
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

    expect(find.text('الإدارة'), findsOneWidget);
  });

  testWidgets('admin create user form validates required fields', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          backendRepositoryProvider.overrideWithValue(FakeAdminRepository()),
        ],
        child: const MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: AdminUserFormScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('إضافة المستخدم'));
    await tester.pump();

    expect(find.text('الحقل مطلوب'), findsAtLeastNWidgets(3));
  });

  testWidgets('admin create user sends requirePasswordChange by default', (
    tester,
  ) async {
    final repo = FakeAdminRepository();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [backendRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp.router(
          routerConfig: GoRouter(
            initialLocation: '/admin/users/new',
            routes: [
              GoRoute(
                path: '/admin/users/new',
                builder: (context, state) => const Directionality(
                  textDirection: TextDirection.rtl,
                  child: AdminUserFormScreen(),
                ),
              ),
              GoRoute(
                path: '/admin/users/:id',
                builder: (context, state) => const Directionality(
                  textDirection: TextDirection.rtl,
                  child: Text('تم الحفظ'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'اسم المستخدم'),
      'branch_operator_01',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'الاسم'),
      'Branch Operator 01',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'البريد'),
      'operator01@example.com',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'كلمة مرور مؤقتة'),
      'secret123',
    );
    await tester.tap(find.text('إضافة المستخدم'));
    await tester.pumpAndSettle();

    expect(repo.createdBody?['requirePasswordChange'], isTrue);
    expect(repo.createdBody?['branchIds'], ['branch-riyadh']);
    expect(repo.assignedRoleId, 'role-branch-operator');
    expect(find.text('تم الحفظ'), findsOneWidget);
  });

  testWidgets('admin create user shows API error correlationId', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          backendRepositoryProvider.overrideWithValue(
            FakeAdminRepository(failCreate: true),
          ),
        ],
        child: const MaterialApp(
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: AdminUserFormScreen(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'اسم المستخدم'),
      'branch_operator_01',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'الاسم'),
      'Branch Operator 01',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'كلمة مرور مؤقتة'),
      'secret123',
    );
    await tester.tap(find.text('إضافة المستخدم'));
    await tester.pumpAndSettle();

    expect(find.textContaining('corr-admin-test'), findsOneWidget);
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

  @override
  Future<List<Map<String, Object?>>> activeProducts() async {
    return [
      {
        'id': 'product-1',
        'code': 'FATAYER_SPINACH',
        'nameAr': 'فطائر سبانخ',
        'erpnextItemCode': 'ERP-FATAYER-SPINACH',
      },
    ];
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

class FakeAdminRepository extends FakeOrdersRepository {
  FakeAdminRepository({this.failCreate = false});

  final bool failCreate;
  Map<String, Object?>? createdBody;
  String? assignedRoleId;

  @override
  Future<List<Map<String, Object?>>> adminBranches() async {
    return [
      {
        'id': 'branch-riyadh',
        'code': 'RIYADH',
        'nameAr': 'الرياض',
        'nameEn': 'Riyadh',
      },
    ];
  }

  @override
  Future<List<Map<String, Object?>>> adminRoles() async {
    return [
      {
        'id': 'role-branch-operator',
        'code': 'BRANCH_OPERATOR',
        'nameAr': 'مشغل فرع',
        'nameEn': 'Branch Operator',
      },
    ];
  }

  @override
  Future<Map<String, Object?>> createAdminUser(
    Map<String, Object?> body,
  ) async {
    if (failCreate) {
      throw const ApiException(
        ApiError(
          code: 'ADMIN_CREATE_FAILED',
          message: 'تعذر إنشاء المستخدم',
          correlationId: 'corr-admin-test',
        ),
      );
    }
    createdBody = body;
    return {
      'id': 'user-1',
      'username': body['username'],
      'displayName': body['displayName'],
      'requirePasswordChange': body['requirePasswordChange'],
    };
  }

  @override
  Future<Map<String, Object?>> assignAdminUserRole(
    String userId,
    String roleId,
  ) async {
    assignedRoleId = roleId;
    return {'id': userId, 'roleId': roleId};
  }
}
