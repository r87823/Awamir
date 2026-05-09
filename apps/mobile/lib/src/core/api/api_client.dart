import 'package:dio/dio.dart';

import '../../config/environment.dart';
import '../auth/session.dart';
import 'api_error.dart';
import 'response_trace.dart';

class AwamirApiClient {
  AwamirApiClient({
    Dio? dio,
    ResponseTraceStore? traceStore,
    String? baseUrl,
    UserSession? Function()? sessionProvider,
  }) : _dio =
           dio ??
           Dio(
             BaseOptions(
               baseUrl: baseUrl ?? Environment.backendBaseUrl,
               connectTimeout: const Duration(seconds: 10),
               receiveTimeout: const Duration(seconds: 20),
             ),
           ),
       _traceStore = traceStore ?? ResponseTraceStore(),
       _sessionProvider = sessionProvider;

  final Dio _dio;
  final ResponseTraceStore _traceStore;
  final UserSession? Function()? _sessionProvider;
  UserSession? _session;

  ResponseTrace get latestTrace => _traceStore.latest;

  set session(UserSession? value) {
    _session = value;
  }

  Future<Map<String, Object?>> login(String username, String password) async {
    final response = await post(
      '/auth/login',
      data: {'username': username, 'password': password},
    );
    return response;
  }

  Future<Map<String, Object?>> get(
    String path, {
    Map<String, Object?>? query,
  }) async {
    return _request('GET', path, queryParameters: query);
  }

  Future<Map<String, Object?>> post(
    String path, {
    Object? data,
    Map<String, Object?>? query,
  }) async {
    return _request('POST', path, data: data, queryParameters: query);
  }

  Future<Map<String, Object?>> patch(
    String path, {
    Object? data,
    Map<String, Object?>? query,
  }) async {
    return _request('PATCH', path, data: data, queryParameters: query);
  }

  Future<Map<String, Object?>> _request(
    String method,
    String path, {
    Object? data,
    Map<String, Object?>? queryParameters,
  }) async {
    try {
      final response = await _dio.request<Object?>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: Options(method: method, headers: _headers()),
      );
      _captureTrace(response);
      final body = response.data;
      if (body is Map) return Map<String, Object?>.from(body);
      if (body is List) return {'data': body};
      return {'data': body};
    } on DioException catch (error) {
      if (error.response != null) _captureTrace(error.response!);
      throw ApiException(_errorFromDio(error));
    }
  }

  Map<String, String> _headers() {
    final session = _sessionProvider?.call() ?? _session;
    if (session == null) return {};
    return {
      'Authorization': 'Bearer ${session.token}',
      'x-permissions': session.permissions.join(','),
      'x-actor-id': session.actorId,
      if (session.branchId != null) 'x-branch-id': session.branchId!,
      if (session.driverId != null) 'x-driver-id': session.driverId!,
      if (session.departmentIds.isNotEmpty)
        'x-department-ids': session.departmentIds.join(','),
    };
  }

  void _captureTrace(Response<Object?> response) {
    _traceStore.update(
      requestId: response.headers.value('x-request-id'),
      correlationId: response.headers.value('x-correlation-id'),
    );
  }

  ApiError _errorFromDio(DioException error) {
    final data = error.response?.data;
    if (data is Map) {
      return ApiError.fromJson(Map<String, Object?>.from(data));
    }
    return ApiError(
      code: 'NETWORK_ERROR',
      message: error.message ?? 'تعذر الاتصال بالخادم',
      correlationId: latestTrace.correlationId,
    );
  }
}
