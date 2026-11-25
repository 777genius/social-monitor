// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/list_source_profiles_response_dto.dart';

part 'sources_client.g.dart';

@RestApi()
abstract class SourcesClient {
  factory SourcesClient(Dio dio, {String? baseUrl}) = _SourcesClient;

  /// List source capability and readiness profiles.
  @GET('/sources/profiles')
  Future<ListSourceProfilesResponseDto> sourceProfileControllerList();
}
