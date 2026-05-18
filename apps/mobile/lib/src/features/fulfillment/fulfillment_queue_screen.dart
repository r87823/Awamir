import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';
import '../../core/ui/status_widgets.dart';

class FulfillmentQueueScreen extends ConsumerStatefulWidget {
  const FulfillmentQueueScreen({super.key});

  @override
  ConsumerState<FulfillmentQueueScreen> createState() =>
      _FulfillmentQueueScreenState();
}

class _FulfillmentQueueScreenState
    extends ConsumerState<FulfillmentQueueScreen> {
  int refresh = 0;
  String? message;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'قائمة التجهيز',
      body: AsyncStateView(
        key: ValueKey(refresh),
        future: repo.fulfillmentQueue(),
        builder: (context, page) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            ActionMessage(message),
            if (page.data.isEmpty)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: Text('لا توجد بيانات')),
              ),
            for (final item in page.data)
              Card(
                child: ListTile(
                  title: Text(displayValue(item['orderNumber'])),
                  subtitle: Text(
                    '${displayValue(item['customerName'])} · ${displayValue(item['productionStatus'])}',
                  ),
                  trailing: FilledButton(
                    onPressed: _canSplit(item)
                        ? () => run(
                            () => repo.splitOrderByDepartment(
                              item['id'].toString(),
                            ),
                          )
                        : null,
                    child: const Text('تقسيم'),
                  ),
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
        message = 'تم التقسيم وإنشاء أوامر العمل';
        refresh++;
      });
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }
}

bool _canSplit(Map<String, Object?> order) =>
    order['productionStatus'] == 'PENDING' ||
    order['productionStatus'] == 'NOT_STARTED' ||
    order['status'] == 'APPROVED';
