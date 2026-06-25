import 'dart:async';

import 'package:dio/dio.dart';

import 'dio_generated_api_client.dart';
import 'generated/social_monitor_rest_client.dart';
import 'generated_api_client.dart';
import 'generated_api_platform.dart';

typedef GeneratedApiHeaderProvider = FutureOr<String?> Function();

final class GeneratedApiConfiguration {
  const GeneratedApiConfiguration({
    required this.baseUrl,
    this.authorizationProvider,
    this.workspaceRoleProvider,
    this.correlationIdProvider,
    this.connectTimeout = const Duration(seconds: 10),
    this.sendTimeout = const Duration(seconds: 10),
    this.receiveTimeout = const Duration(seconds: 30),
  });

  final String baseUrl;
  final GeneratedApiHeaderProvider? authorizationProvider;
  final GeneratedApiHeaderProvider? workspaceRoleProvider;
  final GeneratedApiHeaderProvider? correlationIdProvider;
  final Duration connectTimeout;
  final Duration sendTimeout;
  final Duration receiveTimeout;
}

final class GeneratedApiRuntime {
  GeneratedApiRuntime._({
    required Dio dio,
    required this.rest,
    required this.client,
  }) : _dio = dio;

  final Dio _dio;
  final SocialMonitorRestClient rest;
  final GeneratedApiClient client;

  void close({bool force = false}) {
    _dio.close(force: force);
  }
}

GeneratedApiRuntime createGeneratedApiRuntime(
  GeneratedApiConfiguration configuration,
) {
  final dio = Dio(
    BaseOptions(
      baseUrl: configuration.baseUrl,
      connectTimeout: configuration.connectTimeout,
      sendTimeout: generatedApiIsWeb ? null : configuration.sendTimeout,
      receiveTimeout: configuration.receiveTimeout,
      responseType: ResponseType.json,
      contentType: Headers.jsonContentType,
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        await _setHeaderIfPresent(
          options,
          'authorization',
          configuration.authorizationProvider,
        );
        await _setHeaderIfPresent(
          options,
          'x-workspace-role',
          configuration.workspaceRoleProvider,
        );
        await _setHeaderIfPresent(
          options,
          'x-correlation-id',
          configuration.correlationIdProvider,
        );
        handler.next(options);
      },
    ),
  );

  return GeneratedApiRuntime._(
    dio: dio,
    rest: SocialMonitorRestClient(dio),
    client: const DioGeneratedApiClient(),
  );
}

Future<void> _setHeaderIfPresent(
  RequestOptions options,
  String name,
  GeneratedApiHeaderProvider? provider,
) async {
  final value = await provider?.call();
  if (value == null || value.trim().isEmpty) {
    return;
  }
  options.headers.putIfAbsent(name, () => value);
}
