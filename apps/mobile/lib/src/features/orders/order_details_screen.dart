import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/permission_guard.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';
import '../../core/ui/status_widgets.dart';

class OrderDetailsScreen extends ConsumerStatefulWidget {
  const OrderDetailsScreen({required this.orderId, super.key});

  final String orderId;

  @override
  ConsumerState<OrderDetailsScreen> createState() => _OrderDetailsScreenState();
}

class _OrderDetailsScreenState extends ConsumerState<OrderDetailsScreen> {
  String? message;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'تفاصيل الطلب',
      showBackButton: true,
      backPath: '/orders',
      body: AsyncStateView(
        key: ValueKey(message),
        future: repo.order(widget.orderId),
        builder: (context, order) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              order['orderNumber']?.toString() ?? widget.orderId,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                StatusChip(value: order['status']),
                StatusChip(value: order['productionStatus']),
                StatusChip(value: order['deliveryStatus']),
                StatusChip(value: order['paymentStatus']),
                StatusChip(value: order['accountingStatus']),
              ],
            ),
            const SizedBox(height: 12),
            InfoRow(label: 'العميل', value: order['customerName']),
            InfoRow(label: 'الجوال', value: order['customerPhone']),
            InfoRow(label: 'العنوان', value: order['customerAddress']),
            InfoRow(label: 'الإجمالي', value: order['grandTotal']),
            InfoRow(label: 'المدفوع', value: order['paidAmount']),
            InfoRow(label: 'المتبقي', value: order['remainingAmount']),
            const SizedBox(height: 16),
            Text('المنتجات', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final item in _items(order))
              Card(
                child: ListTile(
                  title: Text(
                    displayValue(
                      item['productNameAr'] ??
                          item['productName'] ??
                          item['productCode'],
                    ),
                  ),
                  subtitle: Text(
                    'الكمية: ${displayValue(item['quantity'])} · السعر: ${displayValue(item['unitPrice'])}',
                  ),
                ),
              ),
            ActionMessage(message),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                PermissionGuard(
                  permissions: const ['orders:submit'],
                  child: FilledButton(
                    onPressed: _canSubmit(order)
                        ? () => action(() => repo.submitOrder(widget.orderId))
                        : null,
                    child: const Text('إرسال للاعتماد'),
                  ),
                ),
                PermissionGuard(
                  permissions: const ['orders:approve'],
                  child: FilledButton(
                    onPressed: _canApprove(order)
                        ? () => action(() => repo.approveOrder(widget.orderId))
                        : null,
                    child: const Text('اعتماد'),
                  ),
                ),
                PermissionGuard(
                  permissions: const ['orders:reject'],
                  child: OutlinedButton(
                    onPressed: _canApprove(order)
                        ? () => action(
                            () => repo.rejectOrder(
                              widget.orderId,
                              'رفض من التطبيق',
                            ),
                          )
                        : null,
                    child: const Text('رفض'),
                  ),
                ),
                PermissionGuard(
                  permissions: const ['orders:return_for_edit'],
                  child: OutlinedButton(
                    onPressed: _canApprove(order)
                        ? () => action(
                            () => repo.returnOrder(
                              widget.orderId,
                              'إرجاع للتعديل',
                            ),
                          )
                        : null,
                    child: const Text('إرجاع'),
                  ),
                ),
                PermissionGuard(
                  permissions: const ['packing:pack'],
                  child: OutlinedButton(
                    onPressed: _canPack(order)
                        ? () => action(() => repo.packOrder(widget.orderId))
                        : null,
                    child: const Text('تغليف'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> action(Future<Object?> Function() run) async {
    try {
      await run();
      setState(() => message = 'تم تنفيذ العملية');
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }
}

List<Map<String, Object?>> _items(Map<String, Object?> order) {
  final raw = order['items'];
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((item) => Map<String, Object?>.from(item))
      .toList();
}

bool _canSubmit(Map<String, Object?> order) => order['status'] == 'DRAFT';

bool _canApprove(Map<String, Object?> order) =>
    order['status'] == 'PENDING_APPROVAL';

bool _canPack(Map<String, Object?> order) =>
    order['productionStatus'] == 'READY_FOR_PACKING';
