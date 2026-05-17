import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/accounting/accounting_dashboard_screen.dart';
import '../../features/admin/admin_dashboard_screen.dart';
import '../../features/admin/admin_user_form_screen.dart';
import '../../features/admin/admin_users_screen.dart';
import '../../features/cashbox/cashbox_today_screen.dart';
import '../../features/dashboard/dashboard_screen.dart';
import '../../features/delivery/driver_batches_screen.dart';
import '../../features/fulfillment/fulfillment_queue_screen.dart';
import '../../features/login/login_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/orders/create_order_screen.dart';
import '../../features/orders/order_details_screen.dart';
import '../../features/orders/orders_list_screen.dart';
import '../../features/orders/supervisor_queue_screen.dart';
import '../../features/payments/payment_collection_screen.dart';
import '../../features/production/production_work_orders_screen.dart';
import '../providers.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authControllerProvider);
  return createAppRouter(auth);
});

GoRouter createAppRouter(AuthController auth) {
  return GoRouter(
    initialLocation: '/login',
    refreshListenable: auth,
    redirect: (context, state) {
      final loggingIn = state.matchedLocation == '/login';
      if (!auth.isReady) return loggingIn ? null : '/login';
      if (!auth.isAuthenticated) return loggingIn ? null : '/login';
      if (loggingIn) return '/';

      final required = routePermissions[state.matchedLocation] ?? const [];
      if (required.isNotEmpty && !auth.hasAny(required)) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/', builder: (context, state) => const DashboardScreen()),
      GoRoute(
        path: '/orders',
        builder: (context, state) => const OrdersListScreen(),
      ),
      GoRoute(
        path: '/orders/new',
        builder: (context, state) => const CreateOrderScreen(),
      ),
      GoRoute(
        path: '/orders/:id',
        builder: (context, state) =>
            OrderDetailsScreen(orderId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/approval',
        builder: (context, state) => const SupervisorQueueScreen(),
      ),
      GoRoute(
        path: '/fulfillment',
        builder: (context, state) => const FulfillmentQueueScreen(),
      ),
      GoRoute(
        path: '/production',
        builder: (context, state) => const ProductionWorkOrdersScreen(),
      ),
      GoRoute(
        path: '/delivery',
        builder: (context, state) => const DriverBatchesScreen(),
      ),
      GoRoute(
        path: '/payments',
        builder: (context, state) => const PaymentCollectionScreen(),
      ),
      GoRoute(
        path: '/cashbox',
        builder: (context, state) => const CashboxTodayScreen(),
      ),
      GoRoute(
        path: '/accounting',
        builder: (context, state) => const AccountingDashboardScreen(),
      ),
      GoRoute(
        path: '/notifications',
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/admin',
        builder: (context, state) => const AdminDashboardScreen(),
      ),
      GoRoute(
        path: '/admin/users',
        builder: (context, state) => const AdminUsersScreen(),
      ),
      GoRoute(
        path: '/admin/users/new',
        builder: (context, state) => const AdminUserFormScreen(),
      ),
      GoRoute(
        path: '/admin/users/:id',
        builder: (context, state) =>
            AdminUserFormScreen(userId: state.pathParameters['id']!),
      ),
    ],
  );
}

const routePermissions = <String, List<String>>{
  '/orders': ['orders:view'],
  '/orders/new': ['orders:create'],
  '/approval': ['orders:approve', 'orders:reject', 'orders:return_for_edit'],
  '/fulfillment': ['orders:view'],
  '/production': ['production_operator'],
  '/delivery': ['delivery_driver'],
  '/payments': ['payment.collect_branch', 'payment.collect_delivery'],
  '/cashbox': ['cashbox.view_own'],
  '/accounting': ['accounting.view_financials'],
  '/notifications': ['notifications:view'],
  '/admin': ['admin.users.view', 'admin.users.manage', 'admin.roles.view'],
  '/admin/users': ['admin.users.view'],
  '/admin/users/new': ['admin.users.manage'],
  '/admin/users/:id': ['admin.users.view'],
};
