import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../core/ui/status_widgets.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';

class OrdersListScreen extends ConsumerStatefulWidget {
  const OrdersListScreen({super.key});

  @override
  ConsumerState<OrdersListScreen> createState() => _OrdersListScreenState();
}

class _OrdersListScreenState extends ConsumerState<OrdersListScreen> {
  final search = TextEditingController();
  String? status;
  int refresh = 0;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'الطلبات',
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.go('/orders/new'),
        child: const Icon(Icons.add),
      ),
      body: AsyncStateView(
        key: ValueKey('$refresh:$status'),
        future: repo.orders(status: status, customerName: search.text),
        builder: (context, page) => RefreshIndicator(
          onRefresh: () async => setState(() => refresh++),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              TextField(
                controller: search,
                decoration: InputDecoration(
                  labelText: 'بحث باسم العميل',
                  suffixIcon: IconButton(
                    tooltip: 'بحث',
                    onPressed: () => setState(() => refresh++),
                    icon: const Icon(Icons.search),
                  ),
                ),
                onSubmitted: (_) => setState(() => refresh++),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String?>(
                initialValue: status,
                decoration: const InputDecoration(labelText: 'الحالة'),
                items: const [
                  DropdownMenuItem(value: null, child: Text('كل الطلبات')),
                  DropdownMenuItem(value: 'DRAFT', child: Text('مسودة')),
                  DropdownMenuItem(
                    value: 'PENDING_APPROVAL',
                    child: Text('بانتظار الاعتماد'),
                  ),
                  DropdownMenuItem(value: 'APPROVED', child: Text('معتمد')),
                  DropdownMenuItem(value: 'READY', child: Text('جاهز')),
                  DropdownMenuItem(value: 'DELIVERED', child: Text('مسلم')),
                ],
                onChanged: (value) => setState(() => status = value),
              ),
              const SizedBox(height: 12),
              if (page.data.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: Text('لا توجد بيانات')),
                )
              else
                for (final item in page.data)
                  Card(
                    child: ListTile(
                      title: Text(
                        item['orderNumber']?.toString() ??
                            item['id'].toString(),
                      ),
                      subtitle: Text(displayValue(item['customerName'])),
                      trailing: StatusChip(value: item['status']),
                      onTap: () => context.go('/orders/${item['id']}'),
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}
