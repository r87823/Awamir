import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';

class PermissionGuard extends ConsumerWidget {
  const PermissionGuard({
    required this.permissions,
    required this.child,
    this.fallback = const SizedBox.shrink(),
    super.key,
  });

  final List<String> permissions;
  final Widget child;
  final Widget fallback;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return ListenableBuilder(
      listenable: auth,
      builder: (context, _) => auth.hasAny(permissions) ? child : fallback,
    );
  }
}
