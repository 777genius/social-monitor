// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scan_requests_client.dart';

// dart format off

// **************************************************************************
// RetrofitGenerator
// **************************************************************************

// ignore_for_file: unnecessary_brace_in_string_interps,no_leading_underscores_for_local_identifiers,unused_element,unnecessary_string_interpolations,unused_element_parameter,avoid_unused_constructor_parameters,unreachable_from_main,avoid_redundant_argument_values

class _ScanRequestsClient implements ScanRequestsClient {
  _ScanRequestsClient(this._dio, {this.baseUrl, this.errorLogger});

  final Dio _dio;

  String? baseUrl;

  final ParseErrorLogger? errorLogger;

  @override
  Future<ScanStatusResponseDto> scanStatusControllerGet({
    required String scanJobId,
    required String xWorkspaceId,
    required String xTenantId,
    String? authorization,
    String? xWorkspaceRole,
  }) async {
    final _extra = <String, dynamic>{};
    final queryParameters = <String, dynamic>{};
    queryParameters.removeWhere((k, v) => v == null);
    final _headers = <String, dynamic>{
      r'x-workspace-id': xWorkspaceId,
      r'x-tenant-id': xTenantId,
      r'authorization': authorization,
      r'x-workspace-role': xWorkspaceRole,
    };
    _headers.removeWhere((k, v) => v == null);
    const Map<String, dynamic>? _data = null;
    final _options = _setStreamType<ScanStatusResponseDto>(
      Options(method: 'GET', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/scan-requests/${scanJobId}/status',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late ScanStatusResponseDto _value;
    try {
      _value = ScanStatusResponseDto.fromJson(_result.data!);
    } on Object catch (e, s) {
      errorLogger?.logError(e, s, _options, response: _result);
      rethrow;
    }
    return _value;
  }

  @override
  Future<ListScanRequestsResponseDto> scanRequestControllerList({
    required String sourceBindingId,
    required String xWorkspaceId,
    required String xTenantId,
    List<Status>? status,
    String? cursor,
    num? limit,
    String? authorization,
    String? xWorkspaceRole,
  }) async {
    final _extra = <String, dynamic>{};
    final queryParameters = <String, dynamic>{
      r'status': status,
      r'cursor': cursor,
      r'limit': limit,
    };
    queryParameters.removeWhere((k, v) => v == null);
    final _headers = <String, dynamic>{
      r'x-workspace-id': xWorkspaceId,
      r'x-tenant-id': xTenantId,
      r'authorization': authorization,
      r'x-workspace-role': xWorkspaceRole,
    };
    _headers.removeWhere((k, v) => v == null);
    const Map<String, dynamic>? _data = null;
    final _options = _setStreamType<ListScanRequestsResponseDto>(
      Options(method: 'GET', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/source-bindings/${sourceBindingId}/scan-requests',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late ListScanRequestsResponseDto _value;
    try {
      _value = ListScanRequestsResponseDto.fromJson(_result.data!);
    } on Object catch (e, s) {
      errorLogger?.logError(e, s, _options, response: _result);
      rethrow;
    }
    return _value;
  }

  @override
  Future<RequestScanResponseDto> scanRequestControllerCreate({
    required String sourceBindingId,
    required String idempotencyKey,
    required String xWorkspaceId,
    required String xTenantId,
    String? xCorrelationId,
    String? authorization,
    String? xWorkspaceRole,
  }) async {
    final _extra = <String, dynamic>{};
    final queryParameters = <String, dynamic>{};
    queryParameters.removeWhere((k, v) => v == null);
    final _headers = <String, dynamic>{
      r'idempotency-key': idempotencyKey,
      r'x-workspace-id': xWorkspaceId,
      r'x-tenant-id': xTenantId,
      r'x-correlation-id': xCorrelationId,
      r'authorization': authorization,
      r'x-workspace-role': xWorkspaceRole,
    };
    _headers.removeWhere((k, v) => v == null);
    const Map<String, dynamic>? _data = null;
    final _options = _setStreamType<RequestScanResponseDto>(
      Options(method: 'POST', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/source-bindings/${sourceBindingId}/scan-requests',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late RequestScanResponseDto _value;
    try {
      _value = RequestScanResponseDto.fromJson(_result.data!);
    } on Object catch (e, s) {
      errorLogger?.logError(e, s, _options, response: _result);
      rethrow;
    }
    return _value;
  }

  @override
  Future<ListSourceBindingDailyScanHistoryResponseDto>
  scanRequestControllerDaily({
    required String sourceBindingId,
    required String xWorkspaceId,
    required String xTenantId,
    num? days,
    String? authorization,
    String? xWorkspaceRole,
  }) async {
    final _extra = <String, dynamic>{};
    final queryParameters = <String, dynamic>{r'days': days};
    queryParameters.removeWhere((k, v) => v == null);
    final _headers = <String, dynamic>{
      r'x-workspace-id': xWorkspaceId,
      r'x-tenant-id': xTenantId,
      r'authorization': authorization,
      r'x-workspace-role': xWorkspaceRole,
    };
    _headers.removeWhere((k, v) => v == null);
    const Map<String, dynamic>? _data = null;
    final _options =
        _setStreamType<ListSourceBindingDailyScanHistoryResponseDto>(
          Options(method: 'GET', headers: _headers, extra: _extra)
              .compose(
                _dio.options,
                '/source-bindings/${sourceBindingId}/scan-requests/daily',
                queryParameters: queryParameters,
                data: _data,
              )
              .copyWith(
                baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl),
              ),
        );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late ListSourceBindingDailyScanHistoryResponseDto _value;
    try {
      _value = ListSourceBindingDailyScanHistoryResponseDto.fromJson(
        _result.data!,
      );
    } on Object catch (e, s) {
      errorLogger?.logError(e, s, _options, response: _result);
      rethrow;
    }
    return _value;
  }

  RequestOptions _setStreamType<T>(RequestOptions requestOptions) {
    if (T != dynamic &&
        !(requestOptions.responseType == ResponseType.bytes ||
            requestOptions.responseType == ResponseType.stream)) {
      if (T == String) {
        requestOptions.responseType = ResponseType.plain;
      } else {
        requestOptions.responseType = ResponseType.json;
      }
    }
    return requestOptions;
  }

  String _combineBaseUrls(String dioBaseUrl, String? baseUrl) {
    if (baseUrl == null || baseUrl.trim().isEmpty) {
      return dioBaseUrl;
    }

    final url = Uri.parse(baseUrl);

    if (url.isAbsolute) {
      return url.toString();
    }

    return Uri.parse(dioBaseUrl).resolveUri(url).toString();
  }
}

// dart format on
