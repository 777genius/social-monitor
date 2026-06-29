// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'relevance_client.dart';

// dart format off

// **************************************************************************
// RetrofitGenerator
// **************************************************************************

// ignore_for_file: unnecessary_brace_in_string_interps,no_leading_underscores_for_local_identifiers,unused_element,unnecessary_string_interpolations,unused_element_parameter,avoid_unused_constructor_parameters,unreachable_from_main,avoid_redundant_argument_values

class _RelevanceClient implements RelevanceClient {
  _RelevanceClient(this._dio, {this.baseUrl, this.errorLogger});

  final Dio _dio;

  String? baseUrl;

  final ParseErrorLogger? errorLogger;

  @override
  Future<BuildPersonalizedDigestResponseDto> relevanceControllerDigest({
    required String userId,
    required String windowEndedAt,
    required String windowStartedAt,
    required String interestIds,
    required String xWorkspaceId,
    required String xTenantId,
    num? limit,
    String? authorization,
    String? xWorkspaceRole,
  }) async {
    final _extra = <String, dynamic>{};
    final queryParameters = <String, dynamic>{
      r'windowEndedAt': windowEndedAt,
      r'windowStartedAt': windowStartedAt,
      r'interestIds': interestIds,
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
    final _options = _setStreamType<BuildPersonalizedDigestResponseDto>(
      Options(method: 'GET', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/relevance/users/${userId}/digest',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late BuildPersonalizedDigestResponseDto _value;
    try {
      _value = BuildPersonalizedDigestResponseDto.fromJson(_result.data!);
    } on Object catch (e, s) {
      errorLogger?.logError(e, s, _options, response: _result);
      rethrow;
    }
    return _value;
  }

  @override
  Future<RankFeedItemsResponseDto> relevanceControllerFeed({
    required String userId,
    required String xWorkspaceId,
    required String xTenantId,
    String? observedAfter,
    num? limit,
    String? interestId,
    String? authorization,
    String? xWorkspaceRole,
  }) async {
    final _extra = <String, dynamic>{};
    final queryParameters = <String, dynamic>{
      r'observedAfter': observedAfter,
      r'limit': limit,
      r'interestId': interestId,
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
    final _options = _setStreamType<RankFeedItemsResponseDto>(
      Options(method: 'GET', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/relevance/users/${userId}/feed',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late RankFeedItemsResponseDto _value;
    try {
      _value = RankFeedItemsResponseDto.fromJson(_result.data!);
    } on Object catch (e, s) {
      errorLogger?.logError(e, s, _options, response: _result);
      rethrow;
    }
    return _value;
  }

  @override
  Future<RecordRelevanceFeedbackResponseDto> relevanceControllerFeedback({
    required String userId,
    required String xWorkspaceId,
    required String xTenantId,
    required RecordRelevanceFeedbackRequestDto body,
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
    final _data = <String, dynamic>{};
    _data.addAll(body.toJson());
    final _options = _setStreamType<RecordRelevanceFeedbackResponseDto>(
      Options(method: 'POST', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/relevance/users/${userId}/feedback',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late RecordRelevanceFeedbackResponseDto _value;
    try {
      _value = RecordRelevanceFeedbackResponseDto.fromJson(_result.data!);
    } on Object catch (e, s) {
      errorLogger?.logError(e, s, _options, response: _result);
      rethrow;
    }
    return _value;
  }

  @override
  Future<UpsertUserRelevanceProfileResponseDto>
  relevanceControllerUpsertProfile({
    required String userId,
    required String xWorkspaceId,
    required String xTenantId,
    required UpsertUserRelevanceProfileRequestDto body,
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
    final _data = <String, dynamic>{};
    _data.addAll(body.toJson());
    final _options = _setStreamType<UpsertUserRelevanceProfileResponseDto>(
      Options(method: 'PUT', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/relevance/users/${userId}/profile',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late UpsertUserRelevanceProfileResponseDto _value;
    try {
      _value = UpsertUserRelevanceProfileResponseDto.fromJson(_result.data!);
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
