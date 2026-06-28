// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/auth_session_response_dto.dart';

part 'auth_client.g.dart';

@RestApi()
abstract class AuthClient {
  factory AuthClient(Dio dio, {String? baseUrl}) = _AuthClient;

  /// Restore the current user session and verified workspace from a Bearer JWT.
  ///
  /// [authorization] - Bearer OIDC JWT user session token.
  @GET('/auth/session')
  Future<AuthSessionResponseDto> authSessionControllerGet({
    @Header('authorization') String? authorization,
  });
}
