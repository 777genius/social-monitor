// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/bind_source_request_dto.dart';
import '../models/bind_source_response_dto.dart';
import '../models/change_source_binding_status_request_dto.dart';
import '../models/change_source_binding_status_response_dto.dart';
import '../models/list_source_binding_overview_response_dto.dart';
import '../models/list_source_bindings_response_dto.dart';
import '../models/list_topic_source_daily_history_response_dto.dart';
import '../models/source_binding_health_response_dto.dart';
import '../models/status2.dart';

part 'source_bindings_client.g.dart';

@RestApi()
abstract class SourceBindingsClient {
  factory SourceBindingsClient(Dio dio, {String? baseUrl}) =
      _SourceBindingsClient;

  /// List source bindings for a topic.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:topics. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Source binding reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/topics/{topicId}/source-bindings')
  Future<ListSourceBindingsResponseDto> sourceBindingControllerList({
    @Path('topicId') required String topicId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('status') List<Status2>? status,
    @Query('providerKey') List<String>? providerKey,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Bind a production-safe source provider to a topic.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:source_bindings. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Source binding creation requires owner or admin. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @POST('/topics/{topicId}/source-bindings')
  Future<BindSourceResponseDto> sourceBindingControllerCreate({
    @Path('topicId') required String topicId,
    @Header('idempotency-key') required String idempotencyKey,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required BindSourceRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Get source binding operational health.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:topics. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Source binding health reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/topics/{topicId}/source-bindings/{sourceBindingId}/health')
  Future<SourceBindingHealthResponseDto> sourceBindingControllerHealth({
    @Path('topicId') required String topicId,
    @Path('sourceBindingId') required String sourceBindingId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Pause or resume a source binding.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:source_bindings. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Source binding status updates require owner or admin. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @PATCH('/topics/{topicId}/source-bindings/{sourceBindingId}/status')
  Future<ChangeSourceBindingStatusResponseDto>
  sourceBindingControllerUpdateStatus({
    @Path('topicId') required String topicId,
    @Path('sourceBindingId') required String sourceBindingId,
    @Header('idempotency-key') required String idempotencyKey,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required ChangeSourceBindingStatusRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// List daily source scan history for a topic grouped by provider.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:topics. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Topic source history reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/topics/{topicId}/source-bindings/daily-history')
  Future<ListTopicSourceDailyHistoryResponseDto>
  sourceBindingControllerDailyHistory({
    @Path('topicId') required String topicId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('providerKey') List<String>? providerKey,
    @Query('days') num? days,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// List source bindings with operational health for a topic.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:topics. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Source binding overview reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/topics/{topicId}/source-bindings/overview')
  Future<ListSourceBindingOverviewResponseDto> sourceBindingControllerOverview({
    @Path('topicId') required String topicId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('status') List<Status2>? status,
    @Query('providerKey') List<String>? providerKey,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
