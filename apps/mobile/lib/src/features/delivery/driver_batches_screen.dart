import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';

class DriverBatchesScreen extends ConsumerStatefulWidget {
  const DriverBatchesScreen({super.key});

  @override
  ConsumerState<DriverBatchesScreen> createState() =>
      _DriverBatchesScreenState();
}

class _DriverBatchesScreenState extends ConsumerState<DriverBatchesScreen> {
  int refresh = 0;
  String? message;

  @override
  Widget build(BuildContext context) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'رحلات السائق',
      body: AsyncStateView(
        key: ValueKey(refresh),
        future: repo.driverBatches(),
        builder: (context, items) => ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: items.length + (message == null ? 0 : 1),
          separatorBuilder: (context, index) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            if (message != null && index == 0) {
              return Text(message!, textAlign: TextAlign.center);
            }
            final batch = items[index - (message == null ? 0 : 1)];
            final id = batch['id'].toString();
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(batch['batchNumber']?.toString() ?? id),
                    Text('الحالة: ${batch['status'] ?? ''}'),
                    Wrap(
                      spacing: 8,
                      children: [
                        TextButton(
                          onPressed: () =>
                              run(() => repo.batchAction(id, 'picked-up')),
                          child: const Text('استلام'),
                        ),
                        TextButton(
                          onPressed: () => run(
                            () => repo.batchAction(id, 'out-for-delivery'),
                          ),
                          child: const Text('بالطريق'),
                        ),
                        TextButton(
                          onPressed: () =>
                              run(() => repo.batchAction(id, 'delivered')),
                          child: const Text('تم التسليم'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Future<void> run(Future<Object?> Function() action) async {
    try {
      await action();
      setState(() {
        message = 'تم التحديث';
        refresh++;
      });
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    }
  }
}
