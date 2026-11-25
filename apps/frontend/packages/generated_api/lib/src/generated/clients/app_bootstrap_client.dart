// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/app_bootstrap_response_dto.dart';

part 'app_bootstrap_client.g.dart';

@RestApi()
abstract class AppBootstrapClient {
  factory AppBootstrapClient(Dio dio, {String? baseUrl}) = _AppBootstrapClient;

  /// Restore the session and initial daily reader-summary data in one request.
  ///
  /// [authorization] - Bearer OIDC JWT user session token.
  @GET('/app/bootstrap')
  Future<AppBootstrapResponseDto> appBootstrapControllerGet({
    @Header('authorization') String? authorization,
  });
}
