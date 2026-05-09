import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';

class CashboxTodayScreen extends ConsumerStatefulWidget {
  const CashboxTodayScreen({super.key});

  @override
  ConsumerState<CashboxTodayScreen> createState() => _CashboxTodayScreenState();
}

class _CashboxTodayScreenState extends ConsumerState<CashboxTodayScreen> {
  final collectedCash = TextEditingController();
  String? message;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'صندوق اليوم',
      body: AsyncStateView(
        future: repo.cashboxToday(),
        builder: (context, cashbox) {
          final id = cashbox['id'].toString();
          collectedCash.text = collectedCash.text.isEmpty
              ? cashbox['expectedCash']?.toString() ?? '0'
              : collectedCash.text;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('الحالة: ${cashbox['status'] ?? ''}'),
              Text('المتوقع: ${cashbox['expectedCash'] ?? ''}'),
              TextField(
                controller: collectedCash,
                decoration: const InputDecoration(labelText: 'النقد المحصل'),
              ),
              if (message != null)
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(message!, textAlign: TextAlign.center),
                ),
              FilledButton(
                onPressed: () => submit(id),
                child: const Text('تسليم الصندوق'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> submit(String id) async {
    try {
      await ref
          .read(backendRepositoryProvider)
          .submitCashbox(id, num.tryParse(collectedCash.text) ?? 0);
      setState(() => message = 'تم تسليم الصندوق');
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }
}
