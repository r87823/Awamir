import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/auth/permission_guard.dart';
import '../../core/providers.dart';
import '../../core/ui/awamir_scaffold.dart';

class AdminERPNextProductsSyncScreen extends ConsumerStatefulWidget {
  const AdminERPNextProductsSyncScreen({super.key});

  @override
  ConsumerState<AdminERPNextProductsSyncScreen> createState() =>
      _AdminERPNextProductsSyncScreenState();
}

class _AdminERPNextProductsSyncScreenState
    extends ConsumerState<AdminERPNextProductsSyncScreen> {
  final limitController = TextEditingController(text: '50');
  final itemGroupController = TextEditingController();
  bool dryRun = true;
  bool loading = false;
  String? error;
  Map<String, Object?>? result;

  @override
  void dispose() {
    limitController.dispose();
    itemGroupController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AwamirScaffold(
      title: 'مزامنة منتجات ERPNext',
      showBackButton: true,
      backPath: '/admin',
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'استيراد Items من ERPNext إلى منتجات Awamir. المنتجات الجديدة تحتاج ربط قسم إنتاج قبل ظهورها في إنشاء الطلب.',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: limitController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'عدد العناصر',
              helperText: 'حد آمن للمزامنة في كل مرة',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: itemGroupController,
            decoration: const InputDecoration(
              labelText: 'مجموعة الأصناف اختيارية',
              helperText: 'اتركها فارغة لجلب كل الأصناف المسموحة',
            ),
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('تجربة فقط بدون حفظ'),
            subtitle: const Text('يعرض ما سيتم إنشاؤه أو تحديثه'),
            value: dryRun,
            onChanged: loading
                ? null
                : (value) => setState(() => dryRun = value),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(error!, textAlign: TextAlign.center),
            ),
          const SizedBox(height: 8),
          PermissionGuard(
            permissions: const ['admin.erpnext.products_sync'],
            fallback: const Text(
              'تحتاج صلاحية مزامنة المنتجات لتنفيذ هذه العملية.',
            ),
            child: Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                FilledButton.icon(
                  onPressed: loading ? null : () => _sync(forceDryRun: true),
                  icon: loading && dryRun
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.visibility),
                  label: const Text('تجربة المزامنة'),
                ),
                FilledButton.tonalIcon(
                  onPressed: loading ? null : _confirmAndSync,
                  icon: loading && !dryRun
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.sync),
                  label: const Text('تنفيذ المزامنة'),
                ),
              ],
            ),
          ),
          if (result != null) ...[
            const SizedBox(height: 20),
            _SyncResultCard(result: result!),
          ],
        ],
      ),
    );
  }

  Future<void> _confirmAndSync() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('تنفيذ المزامنة'),
        content: const Text(
          'سيتم إنشاء أو تحديث منتجات Awamir من ERPNext. لا يتم إنشاء روابط الأقسام تلقائيًا.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('تنفيذ'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _sync(forceDryRun: false);
    }
  }

  Future<void> _sync({required bool forceDryRun}) async {
    final limit = int.tryParse(limitController.text.trim()) ?? 50;
    if (limit <= 0) {
      setState(() => error = 'عدد العناصر يجب أن يكون أكبر من صفر');
      return;
    }
    setState(() {
      loading = true;
      error = null;
      dryRun = forceDryRun;
    });
    try {
      final response = await ref
          .read(backendRepositoryProvider)
          .syncERPNextProducts(
            limit: limit,
            itemGroup: itemGroupController.text,
            dryRun: forceDryRun,
          );
      setState(() => result = response);
    } on ApiException catch (exception) {
      setState(() => error = exception.error.supportMessage);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }
}

class _SyncResultCard extends StatelessWidget {
  const _SyncResultCard({required this.result});

  final Map<String, Object?> result;

  @override
  Widget build(BuildContext context) {
    final rows = _resultRows(result['results']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              result['dryRun'] == true ? 'نتيجة التجربة' : 'نتيجة المزامنة',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _MetricChip(label: 'المجلوبة', value: result['fetched']),
                _MetricChip(label: 'الجديدة', value: result['created']),
                _MetricChip(label: 'المحدثة', value: result['updated']),
                _MetricChip(label: 'المتجاوزة', value: result['skipped']),
              ],
            ),
            const SizedBox(height: 12),
            if (rows.isEmpty)
              const Text('لا توجد نتائج تفصيلية')
            else
              ...rows.map((row) => _ResultTile(row: row)),
          ],
        ),
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.label, required this.value});

  final String label;
  final Object? value;

  @override
  Widget build(BuildContext context) {
    return Chip(label: Text('$label: ${value ?? 0}'));
  }
}

class _ResultTile extends StatelessWidget {
  const _ResultTile({required this.row});

  final Map<String, Object?> row;

  @override
  Widget build(BuildContext context) {
    final action = row['action']?.toString() ?? '-';
    final code = row['code']?.toString() ?? row['erpnextItemCode']?.toString();
    final reason = row['reason']?.toString();
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      leading: Icon(_iconForAction(action)),
      title: Text(code ?? 'منتج بدون كود'),
      subtitle: Text(
        [
          if (row['erpnextItemCode'] != null)
            'ERPNext: ${row['erpnextItemCode']}',
          if (row['productId'] != null) 'Awamir: ${row['productId']}',
          if (reason != null && reason.isNotEmpty) reason,
        ].join('\n'),
      ),
      trailing: Text(action),
    );
  }
}

IconData _iconForAction(String action) {
  return switch (action) {
    'created' => Icons.add_circle_outline,
    'updated' => Icons.edit,
    'skipped' => Icons.skip_next,
    _ => Icons.info_outline,
  };
}

List<Map<String, Object?>> _resultRows(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => Map<String, Object?>.from(item))
      .toList();
}
