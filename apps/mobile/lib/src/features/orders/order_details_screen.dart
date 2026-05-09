import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/permission_guard.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';

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
      body: AsyncStateView(
        future: repo.order(widget.orderId),
        builder: (context, order) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              order['orderNumber']?.toString() ?? widget.orderId,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            Text('الحالة: ${order['status'] ?? ''}'),
            Text('العميل: ${order['customerName'] ?? ''}'),
            Text('الإجمالي: ${order['grandTotal'] ?? ''}'),
            if (message != null)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(message!, textAlign: TextAlign.center),
              ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                PermissionGuard(
                  permissions: const ['orders:submit'],
                  child: FilledButton(
                    onPressed: () =>
                        action(() => repo.submitOrder(widget.orderId)),
                    child: const Text('إرسال للاعتماد'),
                  ),
                ),
                PermissionGuard(
                  permissions: const ['orders:approve'],
                  child: FilledButton(
                    onPressed: () =>
                        action(() => repo.approveOrder(widget.orderId)),
                    child: const Text('اعتماد'),
                  ),
                ),
                PermissionGuard(
                  permissions: const ['orders:reject'],
                  child: OutlinedButton(
                    onPressed: () => action(
                      () => repo.rejectOrder(widget.orderId, 'رفض من التطبيق'),
                    ),
                    child: const Text('رفض'),
                  ),
                ),
                PermissionGuard(
                  permissions: const ['orders:return_for_edit'],
                  child: OutlinedButton(
                    onPressed: () => action(
                      () => repo.returnOrder(widget.orderId, 'إرجاع للتعديل'),
                    ),
                    child: const Text('إرجاع'),
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
