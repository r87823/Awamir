import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';
import '../../core/ui/simple_list.dart';

class OrdersListScreen extends ConsumerWidget {
  const OrdersListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'الطلبات',
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.go('/orders/new'),
        child: const Icon(Icons.add),
      ),
      body: AsyncStateView(
        future: repo.orders(),
        builder: (context, page) => SimpleList(
          items: page.data,
          titleFor: (item) =>
              item['orderNumber']?.toString() ?? item['id'].toString(),
          subtitleFor: (item) =>
              '${item['customerName'] ?? ''} · ${item['status'] ?? ''}',
          onTap: (item) => context.go('/orders/${item['id']}'),
        ),
      ),
    );
  }
}
