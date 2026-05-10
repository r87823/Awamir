import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool unreadOnly = false;
  int refresh = 0;
  String? message;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'التنبيهات',
      actions: [
        TextButton(onPressed: markAll, child: const Text('قراءة الكل')),
      ],
      body: Column(
        children: [
          SwitchListTile(
            value: unreadOnly,
            onChanged: (value) => setState(() {
              unreadOnly = value;
              refresh++;
            }),
            title: const Text('غير المقروءة فقط'),
          ),
          if (message != null)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Text(message!, textAlign: TextAlign.center),
            ),
          Expanded(
            child: AsyncStateView(
              key: ValueKey('$refresh-$unreadOnly'),
              future: repo.notifications(unreadOnly: unreadOnly),
              builder: (context, page) {
                if (page.data.isEmpty) {
                  return const Center(child: Text('لا توجد تنبيهات'));
                }
                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: page.data.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final item = page.data[index];
                    final read = item['readAt'] != null;
                    final id = item['id'].toString();
                    return Card(
                      child: ListTile(
                        leading: Icon(
                          read
                              ? Icons.notifications_none
                              : Icons.notifications_active,
                        ),
                        title: Text(item['title']?.toString() ?? ''),
                        subtitle: Text(item['body']?.toString() ?? ''),
                        trailing: read
                            ? null
                            : IconButton(
                                tooltip: 'تحديد كمقروء',
                                onPressed: () => markRead(id),
                                icon: const Icon(Icons.done),
                              ),
                        onTap: () => navigateToEntity(item),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> markRead(String id) async {
    try {
      await ref.read(backendRepositoryProvider).markNotificationRead(id);
      setState(() {
        message = 'تم تحديث التنبيه';
        refresh++;
      });
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }

  Future<void> markAll() async {
    try {
      final updated = await ref
          .read(backendRepositoryProvider)
          .markAllNotificationsRead();
      setState(() {
        message = 'تم تحديث $updated تنبيه';
        refresh++;
      });
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }

  void navigateToEntity(Map<String, Object?> item) {
    if (item['entityType'] == 'order') {
      final id = item['entityId']?.toString();
      if (id != null && id.isNotEmpty) {
        context.go('/orders/$id');
      }
    }
  }
}
