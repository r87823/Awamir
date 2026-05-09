class ApiError {
  const ApiError({
    required this.code,
    required this.message,
    this.details = const {},
    this.correlationId,
    this.timestamp,
  });

  final String code;
  final String message;
  final Map<String, Object?> details;
  final String? correlationId;
  final String? timestamp;

  factory ApiError.fromJson(Map<String, Object?> json) {
    return ApiError(
      code: json['code']?.toString() ?? 'UNKNOWN_ERROR',
      message: json['message']?.toString() ?? 'حدث خطأ غير متوقع',
      details: json['details'] is Map
          ? Map<String, Object?>.from(json['details'] as Map)
          : const {},
      correlationId: json['correlationId']?.toString(),
      timestamp: json['timestamp']?.toString(),
    );
  }

  String get supportMessage {
    final id = correlationId;
    if (id == null || id.isEmpty) return message;
    return '$message\nرقم التتبع: $id';
  }
}

class ApiException implements Exception {
  const ApiException(this.error);

  final ApiError error;

  @override
  String toString() => '${error.code}: ${error.message}';
}
