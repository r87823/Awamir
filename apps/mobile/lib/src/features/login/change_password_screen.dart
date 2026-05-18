import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';

class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final username = TextEditingController();
  final currentPassword = TextEditingController();
  final newPassword = TextEditingController();
  bool loading = false;
  String? message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('تغيير كلمة المرور'),
        leading: IconButton(
          tooltip: 'رجوع',
          onPressed: () => context.go('/login'),
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: ListView(
            padding: const EdgeInsets.all(24),
            shrinkWrap: true,
            children: [
              TextField(
                controller: username,
                decoration: const InputDecoration(labelText: 'اسم المستخدم'),
              ),
              TextField(
                controller: currentPassword,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'كلمة المرور الحالية',
                ),
              ),
              TextField(
                controller: newPassword,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'كلمة المرور الجديدة',
                ),
              ),
              if (message != null)
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(message!, textAlign: TextAlign.center),
                ),
              FilledButton(
                onPressed: loading ? null : changePassword,
                child: loading
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('تغيير كلمة المرور'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> changePassword() async {
    setState(() {
      loading = true;
      message = null;
    });
    try {
      await ref
          .read(backendRepositoryProvider)
          .changePassword(
            username: username.text.trim(),
            currentPassword: currentPassword.text,
            newPassword: newPassword.text,
          );
      if (mounted) {
        setState(() => message = 'تم تغيير كلمة المرور. سجل الدخول من جديد.');
      }
    } on ApiException catch (exception) {
      setState(() => message = exception.error.supportMessage);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }
}
