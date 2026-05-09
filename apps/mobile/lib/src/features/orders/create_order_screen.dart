import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';
import '../../core/ui/awamir_scaffold.dart';

class CreateOrderScreen extends ConsumerStatefulWidget {
  const CreateOrderScreen({super.key});

  @override
  ConsumerState<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends ConsumerState<CreateOrderScreen> {
  final customerName = TextEditingController(text: 'عميل جديد');
  final branchId = TextEditingController();
  final productId = TextEditingController();
  final quantity = TextEditingController(text: '1');
  final unitPrice = TextEditingController(text: '10');
  String? error;
  bool loading = false;

  @override
  Widget build(BuildContext context) {
    final sessionBranch = ref.watch(authControllerProvider).session?.branchId;
    if (branchId.text.isEmpty && sessionBranch != null) {
      branchId.text = sessionBranch;
    }
    return AwamirScaffold(
      title: 'طلب جديد',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: branchId,
            decoration: const InputDecoration(labelText: 'معرف الفرع'),
          ),
          TextField(
            controller: customerName,
            decoration: const InputDecoration(labelText: 'اسم العميل'),
          ),
          TextField(
            controller: productId,
            decoration: const InputDecoration(labelText: 'معرف المنتج'),
          ),
          TextField(
            controller: quantity,
            decoration: const InputDecoration(labelText: 'الكمية'),
            keyboardType: TextInputType.number,
          ),
          TextField(
            controller: unitPrice,
            decoration: const InputDecoration(labelText: 'السعر'),
            keyboardType: TextInputType.number,
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(error!, textAlign: TextAlign.center),
            ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: loading ? null : submit,
            child: const Text('حفظ كمسودة'),
          ),
        ],
      ),
    );
  }

  Future<void> submit() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final order = await ref.read(backendRepositoryProvider).createOrder({
        'branchId': branchId.text.trim(),
        'customerName': customerName.text.trim(),
        'items': [
          {
            'productId': productId.text.trim(),
            'quantity': num.tryParse(quantity.text) ?? 1,
            'unitPrice': num.tryParse(unitPrice.text) ?? 0,
          },
        ],
      });
      if (mounted) context.go('/orders/${order['id']}');
    } on ApiException catch (exception) {
      setState(() => error = exception.error.supportMessage);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }
}
