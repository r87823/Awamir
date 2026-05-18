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
  final customerPhone = TextEditingController();
  final customerAddress = TextEditingController();
  final notes = TextEditingController();
  final branchId = TextEditingController();
  late Future<List<Map<String, Object?>>> productsFuture;
  final lines = <_OrderLine>[_OrderLine()];
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
      showBackButton: true,
      backPath: '/orders',
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
          for (final line in lines) {
            line.ensureProduct(products);
          }
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
              TextField(
                controller: customerPhone,
                decoration: const InputDecoration(labelText: 'جوال العميل'),
              ),
              TextField(
                controller: customerAddress,
                decoration: const InputDecoration(labelText: 'عنوان العميل'),
              ),
              TextField(
                controller: notes,
                decoration: const InputDecoration(labelText: 'ملاحظات'),
                minLines: 1,
                maxLines: 3,
              ),
              const SizedBox(height: 16),
              Text('المنتجات', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (var index = 0; index < lines.length; index++)
                _OrderLineEditor(
                  key: ValueKey(lines[index]),
                  line: lines[index],
                  products: products,
                  canRemove: lines.length > 1,
                  onChanged: () => setState(() {}),
                  onRemove: () => setState(() => lines.removeAt(index)),
                ),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: products.isEmpty
                      ? null
                      : () => setState(() => lines.add(_OrderLine())),
                  icon: const Icon(Icons.add),
                  label: const Text('إضافة منتج'),
                ),
              ),
              Text(
                'الإجمالي: ${_total().toStringAsFixed(2)}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(error!, textAlign: TextAlign.center),
                ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton(
                    onPressed: loading || products.isEmpty
                        ? null
                        : () => submit(sendForApproval: false),
                    child: const Text('حفظ كمسودة'),
                  ),
                  FilledButton.tonal(
                    onPressed: loading || products.isEmpty
                        ? null
                        : () => submit(sendForApproval: true),
                    child: const Text('إرسال للاعتماد'),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> submit({required bool sendForApproval}) async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final order = await ref.read(backendRepositoryProvider).createOrder({
        'branchId': branchId.text.trim(),
        'customerName': customerName.text.trim(),
        if (customerPhone.text.trim().isNotEmpty)
          'customerPhone': customerPhone.text.trim(),
        if (customerAddress.text.trim().isNotEmpty)
          'customerAddress': customerAddress.text.trim(),
        if (notes.text.trim().isNotEmpty) 'notes': notes.text.trim(),
        'items': [
          for (final line in lines)
            {
              'productId': line.productId,
              'quantity': line.quantity,
              'unitPrice': line.unitPrice,
            },
        ],
      });
      if (sendForApproval) {
        await ref
            .read(backendRepositoryProvider)
            .submitOrder(order['id'].toString());
      }
      if (mounted) context.go('/orders/${order['id']}');
    } on ApiException catch (exception) {
      setState(() => error = exception.error.supportMessage);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  num _total() =>
      lines.fold<num>(0, (sum, line) => sum + (line.quantity * line.unitPrice));
}

String _productLabel(Map<String, Object?> product) =>
    '${product['code'] ?? ''} · ${product['nameAr'] ?? product['nameEn'] ?? ''}';

String _errorMessage(Object? error) {
  if (error is ApiException) return error.error.supportMessage;
  return 'تعذر تحميل المنتجات';
}

class _OrderLine {
  String? productId;
  final quantityController = TextEditingController(text: '1');
  final unitPriceController = TextEditingController(text: '10');

  num get quantity => num.tryParse(quantityController.text) ?? 1;
  num get unitPrice => num.tryParse(unitPriceController.text) ?? 0;

  void ensureProduct(List<Map<String, Object?>> products) {
    if (products.isEmpty) return;
    final exists = products.any(
      (product) => product['id']?.toString() == productId,
    );
    if (!exists) {
      setProduct(products.first);
    }
  }

  void setProduct(Map<String, Object?> product) {
    productId = product['id']?.toString();
    final price =
        product['price'] ?? product['defaultPrice'] ?? product['unitPrice'];
    if (price != null) unitPriceController.text = price.toString();
  }
}

class _OrderLineEditor extends StatelessWidget {
  const _OrderLineEditor({
    required this.line,
    required this.products,
    required this.canRemove,
    required this.onChanged,
    required this.onRemove,
    super.key,
  });

  final _OrderLine line;
  final List<Map<String, Object?>> products;
  final bool canRemove;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            DropdownButtonFormField<String>(
              initialValue: line.productId,
              decoration: const InputDecoration(labelText: 'المنتج'),
              items: [
                for (final product in products)
                  DropdownMenuItem(
                    value: product['id']?.toString(),
                    child: Text(_productLabel(product)),
                  ),
              ],
              onChanged: (value) {
                final product = products.firstWhere(
                  (item) => item['id']?.toString() == value,
                  orElse: () => products.first,
                );
                line.setProduct(product);
                onChanged();
              },
            ),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: line.quantityController,
                    decoration: const InputDecoration(labelText: 'الكمية'),
                    keyboardType: TextInputType.number,
                    onChanged: (_) => onChanged(),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: line.unitPriceController,
                    decoration: const InputDecoration(labelText: 'السعر'),
                    keyboardType: TextInputType.number,
                    onChanged: (_) => onChanged(),
                  ),
                ),
                IconButton(
                  tooltip: 'حذف المنتج',
                  onPressed: canRemove ? onRemove : null,
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
