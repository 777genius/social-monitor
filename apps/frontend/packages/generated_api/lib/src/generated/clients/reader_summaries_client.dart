// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/cadence.dart';
import '../models/decide_reader_summary_topic_recommendation_request_dto.dart';
import '../models/decide_reader_summary_topic_recommendation_response_dto.dart';
import '../models/freshness_status.dart';
import '../models/list_reader_summaries_response_dto.dart';
import '../models/list_reader_summary_periods_response_dto.dart';
import '../models/list_reader_summary_topic_recommendations_response_dto.dart';
import '../models/reader_summary_job_status_response_dto.dart';
import '../models/reader_summary_quality_rejection_response_dto.dart';
import '../models/reader_summary_response_dto.dart';
import '../models/reader_summary_weekly_projection_response_dto.dart';
import '../models/request_reader_summary_request_dto.dart';
import '../models/request_reader_summary_response_dto.dart';
import '../models/scope_type.dart';

part 'reader_summaries_client.g.dart';

@RestApi()
abstract class ReaderSummariesClient {
  factory ReaderSummariesClient(Dio dio, {String? baseUrl}) =
      _ReaderSummariesClient;

  /// List tenant/workspace summaries with cursor pagination.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. ReaderSummary reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/reader-summaries')
  Future<ListReaderSummariesResponseDto> readerSummaryControllerList({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Query('memoryGuidanceApplied') bool? memoryGuidanceApplied,
    @Query('freshnessStatus') FreshnessStatus? freshnessStatus,
    @Query('subscriptionId') String? subscriptionId,
    @Query('userId') String? userId,
    @Query('providerKey') String? providerKey,
    @Query('timezone') String? timezone,
    @Query('periodEndedAt') String? periodEndedAt,
    @Query('periodStartedAt') String? periodStartedAt,
    @Query('cadence') Cadence? cadence,
    @Query('interestId') String? interestId,
    @Query('scopeType') ScopeType? scopeType,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Get one tenant/workspace summary by id.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. ReaderSummary reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/reader-summaries/{readerSummaryId}')
  Future<ReaderSummaryResponseDto> readerSummaryControllerGet({
    @Path('readerSummaryId') required String readerSummaryId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// List lightweight reader summary periods for calendars.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. ReaderSummary reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/reader-summaries/periods')
  Future<ListReaderSummaryPeriodsResponseDto>
  readerSummaryControllerListPeriods({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Query('timezone') String? timezone,
    @Query('periodEndedAt') String? periodEndedAt,
    @Query('periodStartedBefore') String? periodStartedBefore,
    @Query('periodStartedFrom') String? periodStartedFrom,
    @Query('periodStartedAt') String? periodStartedAt,
    @Query('cadence') Cadence? cadence,
    @Query('interestId') String? interestId,
    @Query('scopeType') ScopeType? scopeType,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Get the certified Monday-Sunday UTC reader summary projection.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. ReaderSummary reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/reader-summaries/weekly')
  Future<ReaderSummaryWeeklyProjectionResponseDto>
  readerSummaryWeeklyProjectionControllerGet({
    @Query('weekStartedOn') required String weekStartedOn,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Get safe quality rejection diagnostics for a readerSummary job.
  ///
  /// [xWorkspaceRole] - Local-dev fallback only. ReaderSummary quality rejection diagnostics require owner or admin.
  ///
  /// [authorization] - Bearer OIDC JWT for production ReaderSummary quality rejection diagnostics.
  @GET('/reader-summary-jobs/{readerSummaryJobId}/quality-rejection')
  Future<ReaderSummaryQualityRejectionResponseDto>
  readerSummaryJobControllerGetQualityRejection({
    @Path('readerSummaryJobId') required String readerSummaryJobId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('x-workspace-role') String? xWorkspaceRole,
    @Header('authorization') String? authorization,
  });

  /// Get readerSummary job status and safe timeline.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. ReaderSummary job reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/reader-summary-jobs/{readerSummaryJobId}/status')
  Future<ReaderSummaryJobStatusResponseDto>
  readerSummaryJobControllerGetStatus({
    @Path('readerSummaryJobId') required String readerSummaryJobId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Request a readerSummary for a workspace or interest scope.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. ReaderSummary requests require owner, admin or member. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @POST('/reader-summary-requests')
  Future<RequestReaderSummaryResponseDto> readerSummaryRequestControllerCreate({
    @Header('idempotency-key') required String idempotencyKey,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required RequestReaderSummaryRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// List topic promotion recommendations from recent summaries.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - ReaderSummary recommendation reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/reader-summary-topic-recommendations')
  Future<ListReaderSummaryTopicRecommendationsResponseDto>
  readerSummaryTopicRecommendationControllerList({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('limit') num? limit,
    @Query('windowDays') num? windowDays,
    @Query('interestId') String? interestId,
    @Query('scopeType') ScopeType? scopeType,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Accept, reject or undo a topic promotion recommendation.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - ReaderSummary topic recommendation decisions allow owner or admin. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @POST('/reader-summary-topic-recommendations/{recommendationId}/decision')
  Future<DecideReaderSummaryTopicRecommendationResponseDto>
  readerSummaryTopicRecommendationControllerDecide({
    @Path('recommendationId') required String recommendationId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required DecideReaderSummaryTopicRecommendationRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
    @Header('x-user-id') String? xUserId,
  });
}
