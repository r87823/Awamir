import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';

class ProductionWorkOrdersScreen extends ConsumerStatefulWidget {
  const ProductionWorkOrdersScreen({super.key});

  @override
  ConsumerState<ProductionWorkOrdersScreen> createState() =>
      _ProductionWorkOrdersScreenState();
}

class _ProductionWorkOrdersScreenState
    extends ConsumerState<ProductionWorkOrdersScreen> {
  int refresh = 0;
  String? message;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'أوامر الإنتاج',
      body: AsyncStateView(
        key: ValueKey(refresh),
        future: repo.productionWorkOrders(),
        builder: (context, page) => ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: page.data.length + (message == null ? 0 : 1),
          separatorBuilder: (context, index) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            if (message != null && index == 0) {
              return Text(message!, textAlign: TextAlign.center);
            }
            final item = page.data[index - (message == null ? 0 : 1)];
            final id = item['id'].toString();
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('أمر عمل: $id'),
                    Text('الحالة: ${item['status'] ?? ''}'),
                    Wrap(
                      spacing: 8,
                      children: [
                        TextButton(
                          onPressed: () =>
                              run(() => repo.workOrderAction(id, 'accept')),
                          child: const Text('استلام'),
                        ),
                        TextButton(
                          onPressed: () => run(
                            () => repo.workOrderAction(id, 'in-production'),
                          ),
                          child: const Text('بدء'),
                        ),
                        TextButton(
                          onPressed: () =>
                              run(() => repo.workOrderAction(id, 'ready')),
                          child: const Text('جاهز'),
                        ),
                        TextButton(
                          onPressed: () => run(
                            () => repo.delayWorkOrder(id, 'MATERIAL_SHORTAGE'),
                          ),
                          child: const Text('تأخير'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> run(Future<Object?> Function() action) async {
    try {
      await action();
      setState(() {
        message = 'تم التحديث';
        refresh++;
      });
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }
}
