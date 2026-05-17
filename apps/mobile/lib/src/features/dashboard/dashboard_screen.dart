import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/permission_guard.dart';
import '../../core/providers.dart';
import '../../core/ui/awamir_scaffold.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(authControllerProvider).session;
    final tiles = [
      _Tile('الطلبات', Icons.receipt_long, '/orders', ['orders:view']),
      _Tile('طلب جديد', Icons.add_box, '/orders/new', ['orders:create']),
      _Tile('اعتماد المشرف', Icons.verified, '/approval', ['orders:approve']),
      _Tile('التجهيز', Icons.inventory_2, '/fulfillment', ['orders:view']),
      _Tile('الإنتاج', Icons.precision_manufacturing, '/production', [
        'production_operator',
      ]),
      _Tile('التوصيل', Icons.local_shipping, '/delivery', ['delivery_driver']),
      _Tile('المدفوعات', Icons.payments, '/payments', [
        'payment.collect_branch',
        'payment.collect_delivery',
      ]),
      _Tile('الصندوق', Icons.account_balance_wallet, '/cashbox', [
        'cashbox.view_own',
      ]),
      _Tile('المحاسبة', Icons.query_stats, '/accounting', [
        'accounting.view_financials',
      ]),
      _Tile('التنبيهات', Icons.notifications, '/notifications', [
        'notifications:view',
      ], badge: true),
      _Tile('الإدارة', Icons.admin_panel_settings, '/admin', [
        'admin.users.view',
        'admin.users.manage',
        'admin.roles.view',
      ]),
    ];
    return AwamirScaffold(
      title: 'لوحة التشغيل',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('مرحباً ${session?.displayName ?? ''}'),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final tile in tiles)
                PermissionGuard(
                  permissions: tile.permissions,
                  child: _DashboardTile(tile: tile),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DashboardTile extends ConsumerWidget {
  const _DashboardTile({required this.tile});

  final _Tile tile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final countFuture = tile.badge
        ? ref.watch(backendRepositoryProvider).unreadNotificationsCount()
        : Future.value(0);
    return SizedBox(
      width: 170,
      child: Card(
        child: InkWell(
          onTap: () => context.go(tile.path),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: FutureBuilder<int>(
              future: countFuture,
              builder: (context, snapshot) {
                final count = snapshot.data ?? 0;
                return Column(
                  children: [
                    Badge(
                      isLabelVisible: tile.badge && count > 0,
                      label: Text(count.toString()),
                      child: Icon(tile.icon),
                    ),
                    const SizedBox(height: 8),
                    Text(tile.title, textAlign: TextAlign.center),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _Tile {
  const _Tile(
    this.title,
    this.icon,
    this.path,
    this.permissions, {
    this.badge = false,
  });
  final String title;
  final IconData icon;
  final String path;
  final List<String> permissions;
  final bool badge;
}
