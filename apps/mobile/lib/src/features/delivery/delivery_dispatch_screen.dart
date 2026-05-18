import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';
import '../../core/ui/status_widgets.dart';

class DeliveryDispatchScreen extends ConsumerStatefulWidget {
  const DeliveryDispatchScreen({super.key});

  @override
  ConsumerState<DeliveryDispatchScreen> createState() =>
      _DeliveryDispatchScreenState();
}

class _DeliveryDispatchScreenState
    extends ConsumerState<DeliveryDispatchScreen> {
  final selectedOrderIds = <String>{};
  final driverId = TextEditingController();
  int refresh = 0;
  String? message;
  String? createdBatchId;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'تجهيز رحلات التوصيل',
      showBackButton: true,
      body: AsyncStateView(
        key: ValueKey(refresh),
        future: repo.deliveryReadyOrders(),
        builder: (context, page) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'الطلبات الجاهزة للتوصيل',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            ActionMessage(message),
            if (page.data.isEmpty)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: Text('لا توجد طلبات جاهزة')),
              ),
            for (final order in page.data)
              CheckboxListTile(
                value: selectedOrderIds.contains(order['id']),
                onChanged: (value) => setState(() {
                  final id = order['id'].toString();
                  if (value == true) {
                    selectedOrderIds.add(id);
                  } else {
                    selectedOrderIds.remove(id);
                  }
                }),
                title: Text(displayValue(order['orderNumber'])),
                subtitle: Text(displayValue(order['customerName'])),
                secondary: StatusChip(value: order['deliveryStatus']),
              ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: selectedOrderIds.isEmpty ? null : createBatch,
              icon: const Icon(Icons.local_shipping),
              label: const Text('إنشاء رحلة'),
            ),
            if (createdBatchId != null) ...[
              const SizedBox(height: 16),
              TextField(
                controller: driverId,
                decoration: const InputDecoration(labelText: 'معرف السائق'),
              ),
              FilledButton.tonal(
                onPressed: driverId.text.trim().isEmpty ? null : assignDriver,
                child: const Text('تعيين السائق'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> createBatch() async {
    try {
      final batch = await ref
          .read(backendRepositoryProvider)
          .createDeliveryBatch(orderIds: selectedOrderIds.toList());
      setState(() {
        createdBatchId = batch['id']?.toString();
        message = 'تم إنشاء رحلة التوصيل';
        selectedOrderIds.clear();
        refresh++;
      });
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }

  Future<void> assignDriver() async {
    final batchId = createdBatchId;
    if (batchId == null) return;
    try {
      await ref
          .read(backendRepositoryProvider)
          .assignDriver(batchId, driverId.text.trim());
      setState(() => message = 'تم تعيين السائق');
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }
}
