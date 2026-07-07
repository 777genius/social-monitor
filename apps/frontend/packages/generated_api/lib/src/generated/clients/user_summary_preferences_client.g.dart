// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_summary_preferences_client.dart';

// dart format off

// **************************************************************************
// RetrofitGenerator
// **************************************************************************

// ignore_for_file: unnecessary_brace_in_string_interps,no_leading_underscores_for_local_identifiers,unused_element,unnecessary_string_interpolations,unused_element_parameter,avoid_unused_constructor_parameters,unreachable_from_main,avoid_redundant_argument_values

class _UserSummaryPreferencesClient implements UserSummaryPreferencesClient {
  _UserSummaryPreferencesClient(this._dio, {this.baseUrl, this.errorLogger});

  final Dio _dio;

  String? baseUrl;

  final ParseErrorLogger? errorLogger;

  @override
  Future<GetEffectiveUserSummaryPreferenceResponseDto>
  userSummaryPreferencesControllerGetEffectiveInterestSummaryPreference({
    required String interestId,
    required String userId,
    required String xWorkspaceId,
    required String xTenantId,
    String? authorization,
    String? xWorkspaceRole,
    String? subscriptionId,
  }) async {
    final _extra = <String, dynamic>{};
    final queryParameters = <String, dynamic>{
      r'userId': userId,
      r'subscriptionId': subscriptionId,
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
    final _options =
        _setStreamType<GetEffectiveUserSummaryPreferenceResponseDto>(
          Options(method: 'GET', headers: _headers, extra: _extra)
              .compose(
                _dio.options,
                '/interests/${interestId}/user-summary-preference',
                queryParameters: queryParameters,
                data: _data,
              )
              .copyWith(
                baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl),
              ),
        );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late GetEffectiveUserSummaryPreferenceResponseDto _value;
    try {
      _value = GetEffectiveUserSummaryPreferenceResponseDto.fromJson(
        _result.data!,
      );
    } on Object catch (e, s) {
      errorLogger?.logError(e, s, _options, response: _result);
      rethrow;
    }
    return _value;
  }

  @override
  Future<UpsertUserSummaryPreferenceResponseDto>
  userSummaryPreferencesControllerUpsertInterestSummaryPreference({
    required String interestId,
    required String xWorkspaceId,
    required String xTenantId,
    required UpsertInterestUserSummaryPreferenceRequestDto body,
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
    final _options = _setStreamType<UpsertUserSummaryPreferenceResponseDto>(
      Options(method: 'PUT', headers: _headers, extra: _extra)
          .compose(
            _dio.options,
            '/interests/${interestId}/user-summary-preference',
            queryParameters: queryParameters,
            data: _data,
          )
          .copyWith(baseUrl: _combineBaseUrls(_dio.options.baseUrl, baseUrl)),
    );
    final _result = await _dio.fetch<Map<String, Object?>>(_options);
    late UpsertUserSummaryPreferenceResponseDto _value;
    try {
      _value = UpsertUserSummaryPreferenceResponseDto.fromJson(_result.data!);
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
