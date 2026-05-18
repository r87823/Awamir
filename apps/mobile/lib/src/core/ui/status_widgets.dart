import 'package:flutter/material.dart';

String displayValue(Object? value) {
  if (value == null) return '-';
  final text = value.toString();
  return text.isEmpty ? '-' : text;
}

num numberValue(Object? value) {
  if (value is num) return value;
  return num.tryParse(value?.toString() ?? '') ?? 0;
}

class StatusChip extends StatelessWidget {
  const StatusChip({required this.value, super.key});

  final Object? value;

  @override
  Widget build(BuildContext context) {
    final text = displayValue(value);
    final color = _statusColor(text);
    return Chip(
      label: Text(_statusText(text)),
      side: BorderSide(color: color.withValues(alpha: 0.35)),
      backgroundColor: color.withValues(alpha: 0.12),
      labelStyle: TextStyle(color: color),
    );
  }
}

class InfoRow extends StatelessWidget {
  const InfoRow({required this.label, required this.value, super.key});

  final String label;
  final Object? value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: Theme.of(context).textTheme.bodySmall),
          ),
          Expanded(child: Text(displayValue(value))),
        ],
      ),
    );
  }
}

class ActionMessage extends StatelessWidget {
  const ActionMessage(this.message, {super.key});

  final String? message;

  @override
  Widget build(BuildContext context) {
    if (message == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Text(message!, textAlign: TextAlign.center),
    );
  }
}

String _statusText(String status) {
  return switch (status) {
    'DRAFT' => 'مسودة',
    'PENDING_APPROVAL' => 'بانتظار الاعتماد',
    'APPROVED' => 'معتمد',
    'REJECTED' => 'مرفوض',
    'READY' => 'جاهز',
    'WAITING_BATCH' => 'بانتظار رحلة',
    'DELIVERED' => 'تم التسليم',
    'PAID' => 'مدفوع',
    'PARTIALLY_PAID' => 'مدفوع جزئياً',
    'UNPAID' => 'غير مدفوع',
    'POSTED' => 'مرحل',
    'ACCOUNTING_POSTED' => 'محاسبيًا مكتمل',
    'OPEN' => 'مفتوح',
    'SUBMITTED' => 'مسلّم',
    'UNDER_REVIEW' => 'قيد المراجعة',
    'APPROVED_CASHBOX' => 'معتمد',
    'CLOSED' => 'مغلق',
    _ => status,
  };
}

Color _statusColor(String status) {
  return switch (status) {
    'APPROVED' || 'READY' || 'DELIVERED' || 'PAID' || 'POSTED' => Colors.green,
    'PENDING_APPROVAL' || 'WAITING_BATCH' || 'PARTIALLY_PAID' => Colors.orange,
    'REJECTED' || 'CANCELLED' || 'FAILED' || 'DEAD_LETTER' => Colors.red,
    _ => Colors.blueGrey,
  };
}
