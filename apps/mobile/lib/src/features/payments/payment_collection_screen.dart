import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';
import '../../core/ui/status_widgets.dart';

class PaymentCollectionScreen extends ConsumerStatefulWidget {
  const PaymentCollectionScreen({super.key});

  @override
  ConsumerState<PaymentCollectionScreen> createState() =>
      _PaymentCollectionScreenState();
}

class _PaymentCollectionScreenState
    extends ConsumerState<PaymentCollectionScreen> {
  final amount = TextEditingController(text: '10');
  String method = 'CASH';
  String? selectedOrderId;
  String? message;
  int refresh = 0;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'تحصيل دفعة',
      body: AsyncStateView(
        key: ValueKey(refresh),
        future: repo.orders(),
        builder: (context, page) {
          final payable = page.data
              .where((order) => _remaining(order) > 0)
              .toList();
          if (selectedOrderId == null && payable.isNotEmpty) {
            _selectOrder(payable.first, notify: false);
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DropdownButtonFormField<String>(
                initialValue: selectedOrderId,
                decoration: const InputDecoration(labelText: 'الطلب'),
                items: [
                  for (final order in payable)
                    DropdownMenuItem(
                      value: order['id']?.toString(),
                      child: Text(
                        '${displayValue(order['orderNumber'])} · متبقي ${_remaining(order)}',
                      ),
                    ),
                ],
                onChanged: (value) {
                  final order = payable.firstWhere(
                    (item) => item['id']?.toString() == value,
                    orElse: () => payable.first,
                  );
                  _selectOrder(order);
                },
              ),
              TextField(
                controller: amount,
                decoration: const InputDecoration(labelText: 'المبلغ'),
                keyboardType: TextInputType.number,
              ),
              DropdownButtonFormField<String>(
                initialValue: method,
                items: const [
                  DropdownMenuItem(value: 'CASH', child: Text('نقد')),
                  DropdownMenuItem(value: 'CARD', child: Text('بطاقة')),
                  DropdownMenuItem(value: 'TRANSFER', child: Text('تحويل')),
                  DropdownMenuItem(value: 'ONLINE', child: Text('إلكتروني')),
                  DropdownMenuItem(value: 'CREDIT', child: Text('آجل')),
                ],
                onChanged: (value) => setState(() => method = value ?? 'CASH'),
                decoration: const InputDecoration(labelText: 'طريقة الدفع'),
              ),
              ActionMessage(message),
              FilledButton(
                onPressed: selectedOrderId == null ? null : collect,
                child: const Text('تحصيل'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> collect() async {
    final orderId = selectedOrderId;
    if (orderId == null) return;
    try {
      final payment = await ref.read(backendRepositoryProvider).collectPayment({
        'orderId': orderId,
        'amount': num.tryParse(amount.text) ?? 0,
        'method': method,
        'idempotencyKey':
            'mobile:$orderId:${amount.text}:$method:${DateTime.now().millisecondsSinceEpoch}',
      });
      setState(() {
        message = 'تم تحصيل الدفعة: ${displayValue(payment['id'])}';
        selectedOrderId = null;
        refresh++;
      });
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }

  void _selectOrder(Map<String, Object?> order, {bool notify = true}) {
    selectedOrderId = order['id']?.toString();
    amount.text = _remaining(order).toString();
    if (notify) setState(() {});
  }
}

num _remaining(Map<String, Object?> order) {
  final remaining = numberValue(order['remainingAmount']);
  if (remaining > 0) return remaining;
  final total = numberValue(order['grandTotal']);
  final paid = numberValue(order['paidAmount']);
  return total - paid;
}
