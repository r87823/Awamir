import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/providers.dart';
import '../../core/ui/awamir_scaffold.dart';

class AdminUserFormScreen extends ConsumerStatefulWidget {
  const AdminUserFormScreen({this.userId, super.key});

  final String? userId;

  @override
  ConsumerState<AdminUserFormScreen> createState() =>
      _AdminUserFormScreenState();
}

class _AdminUserFormScreenState extends ConsumerState<AdminUserFormScreen> {
  final formKey = GlobalKey<FormState>();
  final username = TextEditingController();
  final displayName = TextEditingController();
  final email = TextEditingController();
  final password = TextEditingController();

  late Future<_AdminUserFormData> dataFuture;
  String? branchId;
  String? roleId;
  bool isActive = true;
  bool requirePasswordChange = true;
  bool saving = false;
  String? error;

  bool get isEditing => widget.userId != null;

  @override
  void initState() {
    super.initState();
    dataFuture = _load();
  }

  @override
  void dispose() {
    username.dispose();
    displayName.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<_AdminUserFormData> _load() async {
    final repo = ref.read(backendRepositoryProvider);
    final branches = await repo.adminBranches();
    final roles = await repo.adminRoles();
    Map<String, Object?>? user;
    if (isEditing) {
      user = await repo.adminUser(widget.userId!);
      username.text = user['username']?.toString() ?? '';
      displayName.text = user['displayName']?.toString() ?? '';
      email.text = user['email']?.toString() ?? '';
      isActive = user['isActive'] != false;
      requirePasswordChange = user['requirePasswordChange'] == true;
      branchId = _firstId(user['branches']) ?? _firstString(user['branchIds']);
      roleId = _firstId(user['roles']);
    }

    branchId ??= _preferredId(branches, 'RIYADH') ?? _firstItemId(branches);
    roleId ??= _preferredId(roles, 'BRANCH_OPERATOR') ?? _firstItemId(roles);
    return _AdminUserFormData(branches: branches, roles: roles, user: user);
  }

  @override
  Widget build(BuildContext context) {
    return AwamirScaffold(
      title: isEditing ? 'تعديل مستخدم' : 'إضافة مستخدم',
      body: FutureBuilder<_AdminUserFormData>(
        future: dataFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(_errorMessage(snapshot.error)),
              ),
            );
          }
          final data = snapshot.data!;
          return Form(
            key: formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                TextFormField(
                  controller: username,
                  enabled: !isEditing,
                  decoration: const InputDecoration(labelText: 'اسم المستخدم'),
                  validator: _required,
                ),
                TextFormField(
                  controller: displayName,
                  decoration: const InputDecoration(labelText: 'الاسم'),
                  validator: _required,
                ),
                TextFormField(
                  controller: email,
                  decoration: const InputDecoration(labelText: 'البريد'),
                  keyboardType: TextInputType.emailAddress,
                ),
                TextFormField(
                  controller: password,
                  decoration: InputDecoration(
                    labelText: isEditing
                        ? 'كلمة مرور جديدة اختياري'
                        : 'كلمة مرور مؤقتة',
                  ),
                  obscureText: true,
                  validator: (value) =>
                      !isEditing && (value == null || value.isEmpty)
                      ? 'الحقل مطلوب'
                      : null,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: branchId,
                  decoration: const InputDecoration(labelText: 'الفرع'),
                  items: [
                    for (final branch in data.branches)
                      DropdownMenuItem(
                        value: branch['id']?.toString(),
                        child: Text(_label(branch)),
                      ),
                  ],
                  onChanged: (value) => setState(() => branchId = value),
                  validator: (value) =>
                      value == null || value.isEmpty ? 'الحقل مطلوب' : null,
                ),
                DropdownButtonFormField<String>(
                  initialValue: roleId,
                  decoration: const InputDecoration(labelText: 'الدور'),
                  items: [
                    for (final role in data.roles)
                      DropdownMenuItem(
                        value: role['id']?.toString(),
                        child: Text(_label(role)),
                      ),
                  ],
                  onChanged: (value) => setState(() => roleId = value),
                  validator: (value) =>
                      value == null || value.isEmpty ? 'الحقل مطلوب' : null,
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('نشط'),
                  value: isActive,
                  onChanged: (value) => setState(() => isActive = value),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('يتطلب تغيير كلمة المرور'),
                  value: requirePasswordChange,
                  onChanged: (value) =>
                      setState(() => requirePasswordChange = value),
                ),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(error!, textAlign: TextAlign.center),
                  ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: saving ? null : save,
                  icon: saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.save),
                  label: Text(isEditing ? 'حفظ' : 'إضافة المستخدم'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> save() async {
    if (!formKey.currentState!.validate()) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final repo = ref.read(backendRepositoryProvider);
      final body = <String, Object?>{
        if (!isEditing) 'username': username.text.trim(),
        'displayName': displayName.text.trim(),
        'email': email.text.trim().isEmpty ? null : email.text.trim(),
        'isActive': isActive,
        'requirePasswordChange': requirePasswordChange,
        'branchIds': [branchId],
        'departmentIds': <String>[],
      };
      if (password.text.isNotEmpty) {
        body['password'] = password.text;
      }
      final user = isEditing
          ? await repo.updateAdminUser(widget.userId!, body)
          : await repo.createAdminUser(body);
      final userId = (user['id'] ?? widget.userId)?.toString();
      if (userId != null && roleId != null) {
        await repo.assignAdminUserRole(userId, roleId!);
      }
      password.clear();
      if (mounted) context.go('/admin/users/${userId ?? widget.userId}');
    } on ApiException catch (exception) {
      password.clear();
      setState(() => error = exception.error.supportMessage);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}

class _AdminUserFormData {
  const _AdminUserFormData({
    required this.branches,
    required this.roles,
    this.user,
  });

  final List<Map<String, Object?>> branches;
  final List<Map<String, Object?>> roles;
  final Map<String, Object?>? user;
}

String? _required(String? value) =>
    value == null || value.trim().isEmpty ? 'الحقل مطلوب' : null;

String _label(Map<String, Object?> item) =>
    '${item['code'] ?? item['username'] ?? item['id']} · ${item['nameAr'] ?? item['nameEn'] ?? item['displayName'] ?? ''}';

String? _preferredId(List<Map<String, Object?>> items, String code) {
  for (final item in items) {
    if (item['code']?.toString() == code) return item['id']?.toString();
  }
  return null;
}

String? _firstItemId(List<Map<String, Object?>> items) =>
    items.isEmpty ? null : items.first['id']?.toString();

String? _firstId(Object? value) {
  if (value is List && value.isNotEmpty && value.first is Map) {
    return (value.first as Map)['id']?.toString();
  }
  return null;
}

String? _firstString(Object? value) {
  if (value is List && value.isNotEmpty) return value.first.toString();
  return null;
}

String _errorMessage(Object? error) {
  if (error is ApiException) return error.error.supportMessage;
  return 'تعذر تحميل البيانات';
}
