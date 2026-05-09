import 'package:flutter/material.dart';

class SimpleList extends StatelessWidget {
  const SimpleList({
    required this.items,
    required this.titleFor,
    this.subtitleFor,
    this.onTap,
    super.key,
  });

  final List<Map<String, Object?>> items;
  final String Function(Map<String, Object?> item) titleFor;
  final String Function(Map<String, Object?> item)? subtitleFor;
  final void Function(Map<String, Object?> item)? onTap;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const Center(child: Text('لا توجد بيانات'));
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      separatorBuilder: (context, index) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final item = items[index];
        return Card(
          child: ListTile(
            title: Text(titleFor(item)),
            subtitle: subtitleFor == null ? null : Text(subtitleFor!(item)),
            trailing: onTap == null ? null : const Icon(Icons.chevron_left),
            onTap: onTap == null ? null : () => onTap!(item),
          ),
        );
      },
    );
  }
}
