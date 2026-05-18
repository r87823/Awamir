import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/permission_guard.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';
import '../../core/ui/status_widgets.dart';

class CashboxTodayScreen extends ConsumerStatefulWidget {
  const CashboxTodayScreen({super.key});

  @override
  ConsumerState<CashboxTodayScreen> createState() => _CashboxTodayScreenState();
}

class _CashboxTodayScreenState extends ConsumerState<CashboxTodayScreen> {
  final collectedCash = TextEditingController();
  String? message;
  int refresh = 0;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'صندوق اليوم',
      body: AsyncStateView(
        key: ValueKey(refresh),
        future: repo.cashboxToday(),
        builder: (context, cashbox) {
          final id = cashbox['id'].toString();
          final expected = numberValue(cashbox['expectedCash']);
          final collected = num.tryParse(collectedCash.text) ?? expected;
          final difference = collected - expected;
          collectedCash.text = collectedCash.text.isEmpty
              ? expected.toString()
              : collectedCash.text;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              StatusChip(value: cashbox['status']),
              InfoRow(label: 'المتوقع', value: cashbox['expectedCash']),
              InfoRow(label: 'المحصل', value: cashbox['collectedCash']),
              InfoRow(label: 'الفرق', value: difference),
              TextField(
                controller: collectedCash,
                decoration: const InputDecoration(labelText: 'النقد المحصل'),
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() {}),
              ),
              ActionMessage(message),
              FilledButton(
                onPressed: _canSubmit(cashbox) ? () => submit(id) : null,
                child: const Text('تسليم الصندوق'),
              ),
              const SizedBox(height: 16),
              PermissionGuard(
                permissions: const ['cashbox.view_all'],
                child: _CashboxReviewPanel(
                  key: ValueKey('review-$refresh'),
                  onChanged: () => setState(() => refresh++),
                ),
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
      setState(() {
        message = 'تم تسليم الصندوق';
        refresh++;
      });
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }
}

bool _canSubmit(Map<String, Object?> cashbox) =>
    cashbox['status'] == 'OPEN' || cashbox['status'] == 'RETURNED';

class _CashboxReviewPanel extends ConsumerStatefulWidget {
  const _CashboxReviewPanel({required this.onChanged, super.key});

  final VoidCallback onChanged;

  @override
  ConsumerState<_CashboxReviewPanel> createState() =>
      _CashboxReviewPanelState();
}

class _CashboxReviewPanelState extends ConsumerState<_CashboxReviewPanel> {
  String? message;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(backendRepositoryProvider);
    return AsyncStateView(
      future: repo.cashboxes(),
      builder: (context, page) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'مراجعة الصناديق',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          ActionMessage(message),
          for (final cashbox in page.data)
            Card(
              child: ListTile(
                title: Text(displayValue(cashbox['collectorUserId'])),
                subtitle: Text(
                  'متوقع ${displayValue(cashbox['expectedCash'])} · فرق ${displayValue(cashbox['difference'])}',
                ),
                trailing: Wrap(
                  spacing: 4,
                  children: [
                    StatusChip(value: cashbox['status']),
                    IconButton(
                      tooltip: 'مراجعة',
                      onPressed: cashbox['status'] == 'SUBMITTED'
                          ? () => run(
                              () =>
                                  repo.reviewCashbox(cashbox['id'].toString()),
                            )
                          : null,
                      icon: const Icon(Icons.rate_review),
                    ),
                    IconButton(
                      tooltip: 'اعتماد',
                      onPressed: cashbox['status'] == 'UNDER_REVIEW'
                          ? () => run(
                              () =>
                                  repo.approveCashbox(cashbox['id'].toString()),
                            )
                          : null,
                      icon: const Icon(Icons.verified),
                    ),
                    IconButton(
                      tooltip: 'إرجاع',
                      onPressed:
                          cashbox['status'] == 'SUBMITTED' ||
                              cashbox['status'] == 'UNDER_REVIEW'
                          ? () => run(
                              () => repo.returnCashbox(
                                cashbox['id'].toString(),
                                'إرجاع من التطبيق',
                              ),
                            )
                          : null,
                      icon: const Icon(Icons.reply),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> run(Future<Object?> Function() action) async {
    try {
      await action();
      setState(() => message = 'تم تحديث الصندوق');
      widget.onChanged();
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }
}
