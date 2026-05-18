import 'api_client.dart';
import 'paged_response.dart';

class BackendRepository {
  const BackendRepository(this._api);

  final AwamirApiClient _api;

  Future<PagedResponse> orders({String? status, String? customerName}) async {
    final query = <String, Object?>{};
    if (status != null) {
      query['status'] = status;
    }
    if (customerName != null && customerName.trim().isNotEmpty) {
      query['customerName'] = customerName.trim();
    }
    return PagedResponse.fromJson(await _api.get('/orders', query: query));
  }

  Future<Map<String, Object?>> order(String id) => _api.get('/orders/$id');

  Future<Map<String, Object?>> createOrder(Map<String, Object?> body) {
    return _api.post('/orders', data: body);
  }

  Future<List<Map<String, Object?>>> activeProducts() async {
    final response = await _api.get('/products/active');
    return listFromResponse(response);
  }

  Future<Map<String, Object?>> submitOrder(String id) {
    return _api.post('/orders/$id/submit-for-approval');
  }

  Future<Map<String, Object?>> approveOrder(String id) {
    return _api.post('/orders/$id/approve');
  }

  Future<Map<String, Object?>> rejectOrder(String id, String reason) {
    return _api.post('/orders/$id/reject', data: {'rejectionReason': reason});
  }

  Future<Map<String, Object?>> returnOrder(String id, String notes) {
    return _api.post('/orders/$id/return-for-edit', data: {'notes': notes});
  }

  Future<PagedResponse> fulfillmentQueue() async {
    return PagedResponse.fromJson(await _api.get('/fulfillment/queue'));
  }

  Future<Map<String, Object?>> splitOrderByDepartment(String orderId) {
    return _api.post('/fulfillment/orders/$orderId/split-by-department');
  }

  Future<Map<String, Object?>> packOrder(String orderId) {
    return _api.post('/fulfillment/orders/$orderId/pack');
  }

  Future<PagedResponse> productionWorkOrders() async {
    return PagedResponse.fromJson(
      await _api.get('/fulfillment/production/work-orders'),
    );
  }

  Future<Map<String, Object?>> workOrderAction(String id, String action) {
    return _api.post('/fulfillment/work-orders/$id/$action');
  }

  Future<Map<String, Object?>> delayWorkOrder(String id, String reasonCode) {
    return _api.post(
      '/fulfillment/work-orders/$id/delay',
      data: {'reasonCode': reasonCode},
    );
  }

  Future<List<Map<String, Object?>>> driverBatches() async {
    final response = await _api.get('/delivery/driver/batches');
    return (response['data'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, Object?>.from(item))
        .toList();
  }

  Future<Map<String, Object?>> batchAction(String id, String action) {
    return _api.post('/delivery/driver/batches/$id/$action');
  }

  Future<PagedResponse> deliveryReadyOrders() async {
    return PagedResponse.fromJson(await _api.get('/delivery/ready-orders'));
  }

  Future<Map<String, Object?>> createDeliveryBatch({
    required List<String> orderIds,
  }) {
    return _api.post('/delivery/batches', data: {'orderIds': orderIds});
  }

  Future<Map<String, Object?>> assignDriver(String batchId, String driverId) {
    return _api.post(
      '/delivery/batches/$batchId/assign-driver',
      data: {'driverId': driverId},
    );
  }

  Future<Map<String, Object?>> markBatchOrderReturned({
    required String batchId,
    required String orderId,
    required String reason,
  }) {
    return _api.post(
      '/delivery/driver/batches/$batchId/orders/$orderId/returned',
      data: {'reasonCode': 'CUSTOMER_RETURNED', 'notes': reason},
    );
  }

  Future<Map<String, Object?>> collectPayment(Map<String, Object?> body) {
    return _api.post('/payments/branch', data: body);
  }

  Future<PagedResponse> payments({String? orderId}) async {
    final query = <String, Object?>{};
    if (orderId != null && orderId.isNotEmpty) query['orderId'] = orderId;
    return PagedResponse.fromJson(await _api.get('/payments', query: query));
  }

  Future<Map<String, Object?>> cashboxToday() =>
      _api.get('/cashboxes/my/today');

  Future<Map<String, Object?>> submitCashbox(String id, num amount) {
    return _api.post('/cashboxes/$id/submit', data: {'collectedCash': amount});
  }

  Future<PagedResponse> cashboxes() async {
    return PagedResponse.fromJson(await _api.get('/cashboxes'));
  }

  Future<Map<String, Object?>> reviewCashbox(String id) {
    return _api.post('/cashboxes/$id/review');
  }

  Future<Map<String, Object?>> approveCashbox(String id) {
    return _api.post('/cashboxes/$id/approve');
  }

  Future<Map<String, Object?>> returnCashbox(String id, String reason) {
    return _api.post('/cashboxes/$id/return', data: {'reason': reason});
  }

  Future<Map<String, Object?>> accountingDashboard() {
    return _api.get('/accounting/dashboard');
  }

  Future<PagedResponse> accountingOrders({String? status}) async {
    final query = <String, Object?>{};
    if (status != null && status.isNotEmpty) query['accountingStatus'] = status;
    return PagedResponse.fromJson(
      await _api.get('/accounting/orders', query: query),
    );
  }

  Future<PagedResponse> accountingPayments({String? status}) async {
    final query = <String, Object?>{};
    if (status != null && status.isNotEmpty) query['status'] = status;
    return PagedResponse.fromJson(
      await _api.get('/accounting/payments', query: query),
    );
  }

  Future<Map<String, Object?>> accountingOrderAction(
    String orderId,
    String action,
  ) {
    return _api.post('/accounting/orders/$orderId/$action');
  }

  Future<Map<String, Object?>> accountingPaymentAction(
    String paymentId,
    String action,
  ) {
    return _api.post('/accounting/payments/$paymentId/$action');
  }

  Future<Map<String, Object?>> reconcilePayments() {
    return _api.post('/accounting/reconcile-payments', data: {});
  }

  Future<Map<String, Object?>> closeFinancialDay() {
    return _api.post('/accounting/close-financial-day', data: {});
  }

  Future<Map<String, Object?>> ordersStatusReport() {
    return _api.get('/reports/orders/status');
  }

  Future<Map<String, Object?>> paymentsSummaryReport() {
    return _api.get('/reports/payments/summary');
  }

  Future<Map<String, Object?>> cashboxesDailyReport() {
    return _api.get('/reports/cashboxes/daily');
  }

  Future<Map<String, Object?>> erpnextFailuresReport() {
    return _api.get('/reports/erpnext/failures');
  }

  Future<Map<String, Object?>> changePassword({
    required String username,
    required String currentPassword,
    required String newPassword,
  }) {
    return _api.post(
      '/auth/change-password',
      data: {
        'username': username,
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
    );
  }

  Future<PagedResponse> notifications({
    bool unreadOnly = false,
    String? type,
  }) async {
    final query = <String, Object?>{};
    if (unreadOnly) {
      query['unreadOnly'] = 'true';
    }
    if (type != null && type.isNotEmpty) {
      query['type'] = type;
    }
    return PagedResponse.fromJson(
      await _api.get('/notifications', query: query),
    );
  }

  Future<int> unreadNotificationsCount() async {
    final response = await _api.get('/notifications/unread-count');
    return intFrom(response['unreadCount']) ?? 0;
  }

  Future<Map<String, Object?>> markNotificationRead(String id) {
    return _api.post('/notifications/$id/read');
  }

  Future<int> markAllNotificationsRead() async {
    final response = await _api.post('/notifications/read-all');
    return intFrom(response['updatedCount']) ?? 0;
  }

  Future<PagedResponse> adminUsers({String? search}) async {
    final query = <String, Object?>{'page': 1, 'pageSize': 50};
    if (search != null && search.isNotEmpty) {
      query['search'] = search;
    }
    return PagedResponse.fromJson(await _api.get('/admin/users', query: query));
  }

  Future<Map<String, Object?>> adminUser(String id) {
    return _api.get('/admin/users/$id');
  }

  Future<Map<String, Object?>> createAdminUser(Map<String, Object?> body) {
    return _api.post('/admin/users', data: body);
  }

  Future<Map<String, Object?>> updateAdminUser(
    String id,
    Map<String, Object?> body,
  ) {
    return _api.patch('/admin/users/$id', data: body);
  }

  Future<List<Map<String, Object?>>> adminRoles() async {
    final response = await _api.get('/admin/roles');
    return listFromResponse(response);
  }

  Future<List<Map<String, Object?>>> adminBranches() async {
    final response = await _api.get('/admin/branches');
    return listFromResponse(response);
  }

  Future<Map<String, Object?>> assignAdminUserRole(
    String userId,
    String roleId,
  ) {
    return _api.post('/admin/users/$userId/roles', data: {'roleId': roleId});
  }
}

List<Map<String, Object?>> listFromResponse(Map<String, Object?> response) {
  final raw = response['data'];
  if (raw is List) {
    return raw
        .whereType<Map>()
        .map((item) => Map<String, Object?>.from(item))
        .toList();
  }
  return const [];
}
