// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/freshness_status.dart';
import '../models/list_reader_summaries_response_dto.dart';
import '../models/reader_summary_job_status_response_dto.dart';
import '../models/reader_summary_response_dto.dart';
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
    @Query('topicId') String? topicId,
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

  /// Request a readerSummary for a workspace or topic scope.
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
}
