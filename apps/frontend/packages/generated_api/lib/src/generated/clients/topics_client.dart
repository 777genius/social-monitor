// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/create_topic_request_dto.dart';
import '../models/create_topic_response_dto.dart';
import '../models/list_topics_response_dto.dart';

part 'topics_client.g.dart';

@RestApi()
abstract class TopicsClient {
  factory TopicsClient(Dio dio, {String? baseUrl}) = _TopicsClient;

  /// List topics inside the current tenant/workspace.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:topics. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Topic reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/topics')
  Future<ListTopicsResponseDto> topicControllerList({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Create a topic inside the current tenant/workspace.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:topics. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Topic creation requires owner or admin. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @POST('/topics')
  Future<CreateTopicResponseDto> topicControllerCreate({
    @Header('idempotency-key') required String idempotencyKey,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required CreateTopicRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
