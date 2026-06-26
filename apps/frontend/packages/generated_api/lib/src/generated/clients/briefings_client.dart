// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/briefing_job_status_response_dto.dart';
import '../models/briefing_response_dto.dart';
import '../models/freshness_status.dart';
import '../models/list_briefings_response_dto.dart';
import '../models/request_briefing_request_dto.dart';
import '../models/request_briefing_response_dto.dart';
import '../models/scope_type.dart';

part 'briefings_client.g.dart';

@RestApi()
abstract class BriefingsClient {
  factory BriefingsClient(Dio dio, {String? baseUrl}) = _BriefingsClient;

  /// Get briefing job status and safe timeline.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Briefing job reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/briefing-jobs/{briefingJobId}/status')
  Future<BriefingJobStatusResponseDto> briefingJobControllerGetStatus({
    @Path('briefingJobId') required String briefingJobId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Request a briefing for a workspace or topic scope.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Briefing requests require owner, admin or member. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @POST('/briefing-requests')
  Future<RequestBriefingResponseDto> briefingRequestControllerCreate({
    @Header('idempotency-key') required String idempotencyKey,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required RequestBriefingRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// List tenant/workspace summaries with cursor pagination.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Briefing reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/briefings')
  Future<ListBriefingsResponseDto> briefingControllerList({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Query('memoryGuidanceApplied') bool? memoryGuidanceApplied,
    @Query('freshnessStatus') FreshnessStatus? freshnessStatus,
    @Query('subscriptionId') String? subscriptionId,
    @Query('userId') String? userId,
    @Query('providerKey') String? providerKey,
    @Query('topicId') String? topicId,
    @Query('scopeType') ScopeType? scopeType,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Get one tenant/workspace summary by id.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Briefing reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/briefings/{briefingId}')
  Future<BriefingResponseDto> briefingControllerGet({
    @Path('briefingId') required String briefingId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
