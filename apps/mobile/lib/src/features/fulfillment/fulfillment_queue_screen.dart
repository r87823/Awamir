import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';
import '../../core/ui/simple_list.dart';

class FulfillmentQueueScreen extends ConsumerWidget {
  const FulfillmentQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'قائمة التجهيز',
      body: AsyncStateView(
        future: repo.fulfillmentQueue(),
        builder: (context, page) => SimpleList(
          items: page.data,
          titleFor: (item) => item['orderNumber']?.toString() ?? '',
          subtitleFor: (item) =>
              '${item['customerName'] ?? ''} · ${item['productionStatus'] ?? ''}',
        ),
      ),
    );
  }
}
