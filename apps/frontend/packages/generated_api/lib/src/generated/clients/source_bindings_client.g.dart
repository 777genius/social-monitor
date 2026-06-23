// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_bindings_client.dart';

// dart format off

// **************************************************************************
// RetrofitGenerator
// **************************************************************************

// ignore_for_file: unnecessary_brace_in_string_interps,no_leading_underscores_for_local_identifiers,unused_element,unnecessary_string_interpolations,unused_element_parameter,avoid_unused_constructor_parameters,unreachable_from_main,avoid_redundant_argument_values

class _SourceBindingsClient implements SourceBindingsClient {
  _SourceBindingsClient(this._dio, {this.baseUrl, this.errorLogger});

  final Dio _dio;

  String? baseUrl;

  final ParseErrorLogger? errorLogger;

  @override
  Future<ListSourceBindingsResponseDto> sourceBindingControllerList({
    required String topicId,
    required String xWorkspaceId,
    required String xTenantId,
    String? cursor,
    num? limit,
    String? authorization,
    String? xWorkspaceRole,
  }) async {
    final _extra = <String, dynamic>{};
    final queryParameters = <String, dynamic>{
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
    final _options = _setStreamType<ListSourceBindingsResponseDto>(
      Options(method: 'GET', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/topics/${topicId}/source-bindings',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late ListSourceBindingsResponseDto _value;
    try {
      _value = ListSourceBindingsResponseDto.fromJson(_result.data!);
    } on Object catch (e, s) {
      errorLogger?.logError(e, s, _options, response: _result);
      rethrow;
    }
    return _value;
  }

  @override
  Future<BindSourceResponseDto> sourceBindingControllerCreate({
    required String topicId,
    required String idempotencyKey,
    required String xWorkspaceId,
    required String xTenantId,
    required BindSourceRequestDto body,
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
      r'authorization': authorization,
      r'x-workspace-role': xWorkspaceRole,
    };
    _headers.removeWhere((k, v) => v == null);
    final _data = <String, dynamic>{};
    _data.addAll(body.toJson());
    final _options = _setStreamType<BindSourceResponseDto>(
      Options(method: 'POST', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/topics/${topicId}/source-bindings',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late BindSourceResponseDto _value;
    try {
      _value = BindSourceResponseDto.fromJson(_result.data!);
    } on Object catch (e, s) {
      errorLogger?.logError(e, s, _options, response: _result);
      rethrow;
    }
    return _value;
  }

  @override
  Future<SourceBindingHealthResponseDto> sourceBindingControllerHealth({
    required String topicId,
    required String sourceBindingId,
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
    final _options = _setStreamType<SourceBindingHealthResponseDto>(
      Options(method: 'GET', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/topics/${topicId}/source-bindings/${sourceBindingId}/health',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late SourceBindingHealthResponseDto _value;
    try {
      _value = SourceBindingHealthResponseDto.fromJson(_result.data!);
    } on Object catch (e, s) {
      errorLogger?.logError(e, s, _options, response: _result);
      rethrow;
    }
    return _value;
  }

  @override
  Future<ChangeSourceBindingStatusResponseDto>
  sourceBindingControllerUpdateStatus({
    required String topicId,
    required String sourceBindingId,
    required String idempotencyKey,
    required String xWorkspaceId,
    required String xTenantId,
    required ChangeSourceBindingStatusRequestDto body,
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
      r'authorization': authorization,
      r'x-workspace-role': xWorkspaceRole,
    };
    _headers.removeWhere((k, v) => v == null);
    final _data = <String, dynamic>{};
    _data.addAll(body.toJson());
    final _options = _setStreamType<ChangeSourceBindingStatusResponseDto>(
      Options(method: 'PATCH', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/topics/${topicId}/source-bindings/${sourceBindingId}/status',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late ChangeSourceBindingStatusResponseDto _value;
    try {
      _value = ChangeSourceBindingStatusResponseDto.fromJson(_result.data!);
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
