class UserSession {
  const UserSession({
    required this.token,
    required this.actorId,
    required this.displayName,
    required this.permissions,
    this.branchId,
    this.branchIds = const [],
    this.driverId,
    this.departmentIds = const [],
  });

  final String token;
  final String actorId;
  final String displayName;
  final Set<String> permissions;
  final String? branchId;
  final List<String> branchIds;
  final String? driverId;
  final List<String> departmentIds;

  bool hasPermission(String permission) => permissions.contains(permission);

  bool hasAny(Iterable<String> required) =>
      required.isEmpty || required.any(permissions.contains);

  factory UserSession.fromJson(Map<String, Object?> json) {
    final user = Map<String, Object?>.from(json['user'] as Map);
    return UserSession(
      token: json['token']?.toString() ?? '',
      actorId: user['actorId']?.toString() ?? '',
      displayName: user['displayName']?.toString() ?? 'مستخدم',
      branchId: user['branchId']?.toString(),
      branchIds: (user['branchIds'] as List? ?? const [])
          .map((item) => item.toString())
          .toList(),
      driverId: user['driverId']?.toString(),
      permissions: (user['permissions'] as List? ?? const [])
          .map((item) => item.toString())
          .toSet(),
      departmentIds: (user['departmentIds'] as List? ?? const [])
          .map((item) => item.toString())
          .toList(),
    );
  }

  Map<String, Object?> toJson() => {
    'token': token,
    'user': {
      'actorId': actorId,
      'displayName': displayName,
      'branchId': branchId,
      'branchIds': branchIds,
      'driverId': driverId,
      'permissions': permissions.toList(),
      'departmentIds': departmentIds,
    },
  };
}
