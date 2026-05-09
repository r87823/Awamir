import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/ui/async_state_view.dart';
import '../../core/ui/awamir_scaffold.dart';

class AccountingDashboardScreen extends ConsumerWidget {
  const AccountingDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(backendRepositoryProvider);
    return AwamirScaffold(
      title: 'لوحة المحاسبة',
      body: AsyncStateView(
        future: repo.accountingDashboard(),
        builder: (context, data) => GridView.count(
          crossAxisCount: MediaQuery.sizeOf(context).width > 600 ? 3 : 2,
          padding: const EdgeInsets.all(16),
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
          children: [
            for (final entry in data.entries)
              Card(
                child: Center(
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
      ),
    );
  }
}
