// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/list_summaries_response_dto.dart';
import '../models/list_summary_feedback_response_dto.dart';
import '../models/record_summary_feedback_request_dto.dart';
import '../models/record_summary_feedback_response_dto.dart';
import '../models/regenerate_summary_response_dto.dart';
import '../models/request_summary_response_dto.dart';
import '../models/summary_job_status_response_dto.dart';
import '../models/summary_response_dto.dart';

part 'summaries_client.g.dart';

@RestApi()
abstract class SummariesClient {
  factory SummariesClient(Dio dio, {String? baseUrl}) = _SummariesClient;

  /// List tenant/workspace summaries with cursor pagination.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Summary reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/summaries')
  Future<ListSummariesResponseDto> summaryControllerList({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Query('topicId') String? topicId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Get one tenant/workspace summary by id.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Summary reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/summaries/{summaryId}')
  Future<SummaryResponseDto> summaryControllerGet({
    @Path('summaryId') required String summaryId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// List classified feedback for one summary with cursor pagination.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Summary feedback reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/summaries/{summaryId}/feedback')
  Future<ListSummaryFeedbackResponseDto> summaryFeedbackControllerList({
    @Path('summaryId') required String summaryId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Record classified feedback for a summary without mutating the artifact.
  ///
  /// [xActorId] - Optional actor id. API-key requests fall back to the API key id when omitted.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Summary feedback allows owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @POST('/summaries/{summaryId}/feedback')
  Future<RecordSummaryFeedbackResponseDto> summaryFeedbackControllerCreate({
    @Path('summaryId') required String summaryId,
    @Header('idempotency-key') required String idempotencyKey,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required RecordSummaryFeedbackRequestDto body,
    @Header('x-actor-id') String? xActorId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Request regeneration for an existing summary.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Summary regenerations require owner, admin or member. Required when Authorization bearer API key is not supplied.
  @POST('/summaries/{summaryId}/regenerations')
  Future<RegenerateSummaryResponseDto> summaryControllerRegenerate({
    @Path('summaryId') required String summaryId,
    @Header('idempotency-key') required String idempotencyKey,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Get summary job status and safe timeline.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Summary job reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/summary-jobs/{summaryJobId}/status')
  Future<SummaryJobStatusResponseDto> summaryJobControllerGetStatus({
    @Path('summaryJobId') required String summaryJobId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Request a summary for a topic.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Summary requests require owner, admin or member. Required when Authorization bearer API key is not supplied.
  @POST('/topics/{topicId}/summary-requests')
  Future<RequestSummaryResponseDto> summaryRequestControllerCreate({
    @Path('topicId') required String topicId,
    @Header('idempotency-key') required String idempotencyKey,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
