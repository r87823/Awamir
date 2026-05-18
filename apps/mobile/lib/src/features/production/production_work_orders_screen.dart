import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';
import '../../core/ui/status_widgets.dart';

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
            final status = item['status']?.toString();
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayValue(item['workOrderNumber'] ?? id),
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        StatusChip(value: status),
                        StatusChip(value: item['departmentNameAr']),
                      ],
                    ),
                    InfoRow(label: 'الطلب', value: item['orderNumber']),
                    InfoRow(label: 'المنتج', value: item['productNameAr']),
                    InfoRow(label: 'الكمية', value: item['quantity']),
                    Wrap(
                      spacing: 8,
                      children: [
                        TextButton(
                          onPressed: _canAccept(status)
                              ? () => run(
                                  () => repo.workOrderAction(id, 'accept'),
                                )
                              : null,
                          child: const Text('استلام'),
                        ),
                        TextButton(
                          onPressed: _canStart(status)
                              ? () => run(
                                  () =>
                                      repo.workOrderAction(id, 'in-production'),
                                )
                              : null,
                          child: const Text('بدء'),
                        ),
                        TextButton(
                          onPressed: _canReady(status)
                              ? () =>
                                    run(() => repo.workOrderAction(id, 'ready'))
                              : null,
                          child: const Text('جاهز'),
                        ),
                        TextButton(
                          onPressed: _canDelay(status)
                              ? () => run(
                                  () => repo.delayWorkOrder(
                                    id,
                                    'MATERIAL_SHORTAGE',
                                  ),
                                )
                              : null,
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

bool _canAccept(String? status) => status == 'CREATED' || status == 'PENDING';

bool _canStart(String? status) => status == 'ACCEPTED';

bool _canReady(String? status) =>
    status == 'ACCEPTED' || status == 'IN_PRODUCTION' || status == 'DELAYED';

bool _canDelay(String? status) =>
    status == 'ACCEPTED' || status == 'IN_PRODUCTION';
