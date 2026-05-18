import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'التقارير',
      showBackButton: true,
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _ReportCard(
            title: 'حالات الطلبات',
            future: repo.ordersStatusReport(),
          ),
          _ReportCard(
            title: 'ملخص المدفوعات',
            future: repo.paymentsSummaryReport(),
          ),
          _ReportCard(
            title: 'الصناديق اليومية',
            future: repo.cashboxesDailyReport(),
          ),
          _ReportCard(
            title: 'فشل ERPNext',
            future: repo.erpnextFailuresReport(),
          ),
        ],
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.title, required this.future});

  final String title;
  final Future<Map<String, Object?>> future;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ExpansionTile(
        title: Text(title),
        children: [
          AsyncStateView(
            future: future,
            builder: (context, data) => Padding(
              padding: const EdgeInsets.all(12),
              child: Text(data.toString()),
            ),
          ),
        ],
      ),
    );
  }
}
