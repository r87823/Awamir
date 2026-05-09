import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';
import '../../core/ui/awamir_scaffold.dart';

class PaymentCollectionScreen extends ConsumerStatefulWidget {
  const PaymentCollectionScreen({super.key});

  @override
  ConsumerState<PaymentCollectionScreen> createState() =>
      _PaymentCollectionScreenState();
}

class _PaymentCollectionScreenState
    extends ConsumerState<PaymentCollectionScreen> {
  final orderId = TextEditingController();
  final amount = TextEditingController(text: '10');
  String method = 'CASH';
  String? message;

  @override
  Widget build(BuildContext context) {
    return AwamirScaffold(
      title: 'تحصيل دفعة',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: orderId,
            decoration: const InputDecoration(labelText: 'معرف الطلب'),
          ),
          TextField(
            controller: amount,
            decoration: const InputDecoration(labelText: 'المبلغ'),
            keyboardType: TextInputType.number,
          ),
          DropdownButtonFormField<String>(
            initialValue: method,
            items: const ['CASH', 'CARD', 'TRANSFER', 'ONLINE', 'CREDIT']
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: (value) => setState(() => method = value ?? 'CASH'),
            decoration: const InputDecoration(labelText: 'طريقة الدفع'),
          ),
          if (message != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(message!, textAlign: TextAlign.center),
            ),
          FilledButton(onPressed: collect, child: const Text('تحصيل')),
        ],
      ),
    );
  }

  Future<void> collect() async {
    try {
      await ref.read(backendRepositoryProvider).collectPayment({
        'orderId': orderId.text.trim(),
        'amount': num.tryParse(amount.text) ?? 0,
        'method': method,
        'idempotencyKey': 'mobile:${orderId.text}:${amount.text}:$method',
      });
      setState(() => message = 'تم تحصيل الدفعة');
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }
}
