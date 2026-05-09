import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';
import '../../core/ui/simple_list.dart';

class SupervisorQueueScreen extends ConsumerWidget {
  const SupervisorQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'طلبات بانتظار الاعتماد',
      body: AsyncStateView(
        future: repo.orders(status: 'PENDING_APPROVAL'),
        builder: (context, page) => SimpleList(
          items: page.data,
          titleFor: (item) => item['orderNumber']?.toString() ?? '',
          subtitleFor: (item) => item['customerName']?.toString() ?? '',
          onTap: (item) => context.go('/orders/${item['id']}'),
        ),
      ),
    );
  }
}
