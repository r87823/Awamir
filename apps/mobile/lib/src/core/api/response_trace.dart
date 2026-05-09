class ResponseTrace {
  const ResponseTrace({this.requestId, this.correlationId});

  final String? requestId;
  final String? correlationId;
}

class ResponseTraceStore {
  ResponseTrace _latest = const ResponseTrace();

  ResponseTrace get latest => _latest;

  void update({String? requestId, String? correlationId}) {
    _latest = ResponseTrace(requestId: requestId, correlationId: correlationId);
  }
}
