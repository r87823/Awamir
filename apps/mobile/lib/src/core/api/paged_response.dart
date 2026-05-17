class PagedResponse {
  const PagedResponse({
    required this.data,
    required this.page,
    required this.pageSize,
    required this.total,
  });

  final List<Map<String, Object?>> data;
  final int page;
  final int pageSize;
  final int total;

  factory PagedResponse.fromJson(Map<String, Object?> json) {
    final items =
        json['data'] ??
        json['users'] ??
        json['orders'] ??
        json['items'] ??
        const [];
    return PagedResponse(
      data: (items as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, Object?>.from(item))
          .toList(),
      page: intFrom(json['page']) ?? 1,
      pageSize: intFrom(json['pageSize']) ?? 20,
      total: intFrom(json['total']) ?? 0,
    );
  }
}

int? intFrom(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '');
}
