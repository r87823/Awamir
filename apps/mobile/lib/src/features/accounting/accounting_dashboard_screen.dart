import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/permission_guard.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';
import '../../core/ui/status_widgets.dart';

class AccountingDashboardScreen extends ConsumerStatefulWidget {
  const AccountingDashboardScreen({super.key});

  @override
  ConsumerState<AccountingDashboardScreen> createState() =>
      _AccountingDashboardScreenState();
}

class _AccountingDashboardScreenState
    extends ConsumerState<AccountingDashboardScreen> {
  int refresh = 0;
  String? message;

  @override
  Widget build(BuildContext context) {
    return AwamirScaffold(
      title: 'لوحة المحاسبة',
      body: DefaultTabController(
        length: 4,
        child: Column(
          children: [
            const TabBar(
              tabs: [
                Tab(text: 'ملخص'),
                Tab(text: 'الطلبات'),
                Tab(text: 'المدفوعات'),
                Tab(text: 'التقارير'),
              ],
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _DashboardTab(
                    key: ValueKey('dash-$refresh'),
                    message: message,
                    onAction: run,
                  ),
                  _AccountingOrdersTab(
                    key: ValueKey('orders-$refresh'),
                    onAction: run,
                  ),
                  _AccountingPaymentsTab(
                    key: ValueKey('payments-$refresh'),
                    onAction: run,
                  ),
                  _ReportsTab(key: ValueKey('reports-$refresh')),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> run(Future<Object?> Function() action) async {
    try {
      await action();
      setState(() {
        message = 'تم تنفيذ العملية';
        refresh++;
      });
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }
}

class _DashboardTab extends ConsumerWidget {
  const _DashboardTab({
    required this.message,
    required this.onAction,
    super.key,
  });

  final String? message;
  final Future<void> Function(Future<Object?> Function() action) onAction;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(backendRepositoryProvider);
    return AsyncStateView(
      future: repo.accountingDashboard(),
      builder: (context, data) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ActionMessage(message),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final entry in data.entries)
                SizedBox(
                  width: 170,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(entry.key, textAlign: TextAlign.center),
                          const SizedBox(height: 8),
                          Text(
                            entry.value.toString(),
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              PermissionGuard(
                permissions: const ['accounting.reconcile_payments'],
                child: FilledButton.tonal(
                  onPressed: () => onAction(repo.reconcilePayments),
                  child: const Text('تسوية المدفوعات'),
                ),
              ),
              PermissionGuard(
                permissions: const ['accounting.close_financial_day'],
                child: FilledButton.tonal(
                  onPressed: () => onAction(repo.closeFinancialDay),
                  child: const Text('إغلاق اليوم المالي'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AccountingOrdersTab extends ConsumerWidget {
  const _AccountingOrdersTab({required this.onAction, super.key});

  final Future<void> Function(Future<Object?> Function() action) onAction;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(backendRepositoryProvider);
    return AsyncStateView(
      future: repo.accountingOrders(),
      builder: (context, page) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (page.data.isEmpty) const Center(child: Text('لا توجد بيانات')),
          for (final order in page.data)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(displayValue(order['orderNumber'])),
                    Wrap(
                      spacing: 8,
                      children: [
                        StatusChip(value: order['accountingStatus']),
                        StatusChip(value: order['status']),
                      ],
                    ),
                    InfoRow(
                      label: 'Sales Order',
                      value: order['erpnextSalesOrderId'],
                    ),
                    InfoRow(
                      label: 'Invoice',
                      value: order['erpnextSalesInvoiceId'],
                    ),
                    Wrap(
                      spacing: 8,
                      children: [
                        PermissionGuard(
                          permissions: const ['accounting.review_sales_order'],
                          child: TextButton(
                            onPressed: () => onAction(
                              () => repo.accountingOrderAction(
                                order['id'].toString(),
                                'review-sales-order',
                              ),
                            ),
                            child: const Text('Review SO'),
                          ),
                        ),
                        PermissionGuard(
                          permissions: const ['accounting.submit_sales_order'],
                          child: TextButton(
                            onPressed: () => onAction(
                              () => repo.accountingOrderAction(
                                order['id'].toString(),
                                'sync-sales-order',
                              ),
                            ),
                            child: const Text('Sync SO'),
                          ),
                        ),
                        PermissionGuard(
                          permissions: const ['accounting.review_invoice'],
                          child: TextButton(
                            onPressed: () => onAction(
                              () => repo.accountingOrderAction(
                                order['id'].toString(),
                                'review-invoice',
                              ),
                            ),
                            child: const Text('Review Invoice'),
                          ),
                        ),
                        PermissionGuard(
                          permissions: const ['accounting.submit_invoice'],
                          child: TextButton(
                            onPressed: () => onAction(
                              () => repo.accountingOrderAction(
                                order['id'].toString(),
                                'sync-invoice',
                              ),
                            ),
                            child: const Text('Sync Invoice'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AccountingPaymentsTab extends ConsumerWidget {
  const _AccountingPaymentsTab({required this.onAction, super.key});

  final Future<void> Function(Future<Object?> Function() action) onAction;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(backendRepositoryProvider);
    return AsyncStateView(
      future: repo.accountingPayments(),
      builder: (context, page) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (page.data.isEmpty) const Center(child: Text('لا توجد بيانات')),
          for (final payment in page.data)
            Card(
              child: ListTile(
                title: Text(displayValue(payment['id'])),
                subtitle: Text(
                  '${displayValue(payment['amount'])} · ${displayValue(payment['method'])} · ${displayValue(payment['erpnextPaymentEntryId'])}',
                ),
                trailing: Wrap(
                  spacing: 4,
                  children: [
                    StatusChip(value: payment['status']),
                    PermissionGuard(
                      permissions: const ['accounting.review_payment'],
                      child: IconButton(
                        tooltip: 'Review',
                        onPressed: () => onAction(
                          () => repo.accountingPaymentAction(
                            payment['id'].toString(),
                            'review',
                          ),
                        ),
                        icon: const Icon(Icons.rate_review),
                      ),
                    ),
                    PermissionGuard(
                      permissions: const ['accounting.submit_payment'],
                      child: IconButton(
                        tooltip: 'Sync',
                        onPressed: () => onAction(
                          () => repo.accountingPaymentAction(
                            payment['id'].toString(),
                            'sync',
                          ),
                        ),
                        icon: const Icon(Icons.sync),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ReportsTab extends ConsumerWidget {
  const _ReportsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(backendRepositoryProvider);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _ReportCard(title: 'حالات الطلبات', future: repo.ordersStatusReport()),
        _ReportCard(
          title: 'ملخص المدفوعات',
          future: repo.paymentsSummaryReport(),
        ),
        _ReportCard(
          title: 'الصناديق اليومية',
          future: repo.cashboxesDailyReport(),
        ),
        _ReportCard(title: 'فشل ERPNext', future: repo.erpnextFailuresReport()),
      ],
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
