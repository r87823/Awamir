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
  final quantity = TextEditingController(text: '1');
  final unitPrice = TextEditingController(text: '10');
  late Future<List<Map<String, Object?>>> productsFuture;
  String? selectedProductId;
  String? error;
  bool loading = false;

  @override
  void initState() {
    super.initState();
    productsFuture = ref.read(backendRepositoryProvider).activeProducts();
  }

  @override
  Widget build(BuildContext context) {
    final sessionBranch = ref.watch(authControllerProvider).session?.branchId;
    if (branchId.text.isEmpty && sessionBranch != null) {
      branchId.text = sessionBranch;
    }
    return AwamirScaffold(
      title: 'طلب جديد',
      body: FutureBuilder<List<Map<String, Object?>>>(
        future: productsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(_errorMessage(snapshot.error)),
              ),
            );
          }
          final products = snapshot.data ?? const [];
          selectedProductId ??= products.isEmpty
              ? null
              : products.first['id']?.toString();
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              TextField(
                controller: branchId,
                readOnly: sessionBranch != null,
                decoration: const InputDecoration(labelText: 'معرف الفرع'),
              ),
              TextField(
                controller: customerName,
                decoration: const InputDecoration(labelText: 'اسم العميل'),
              ),
              DropdownButtonFormField<String>(
                initialValue: selectedProductId,
                decoration: const InputDecoration(labelText: 'المنتج'),
                items: [
                  for (final product in products)
                    DropdownMenuItem(
                      value: product['id']?.toString(),
                      child: Text(_productLabel(product)),
                    ),
                ],
                onChanged: (value) => setState(() => selectedProductId = value),
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
                onPressed: loading || products.isEmpty ? null : submit,
                child: const Text('حفظ كمسودة'),
              ),
            ],
          );
        },
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
            'productId': selectedProductId,
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

String _productLabel(Map<String, Object?> product) =>
    '${product['code'] ?? ''} · ${product['nameAr'] ?? product['nameEn'] ?? ''}';

String _errorMessage(Object? error) {
  if (error is ApiException) return error.error.supportMessage;
  return 'تعذر تحميل المنتجات';
}
