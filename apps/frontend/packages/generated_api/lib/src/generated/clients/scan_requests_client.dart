// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/list_scan_requests_response_dto.dart';
import '../models/request_scan_response_dto.dart';
import '../models/scan_status_response_dto.dart';

part 'scan_requests_client.g.dart';

@RestApi()
abstract class ScanRequestsClient {
  factory ScanRequestsClient(Dio dio, {String? baseUrl}) = _ScanRequestsClient;

  /// Get current scan job status.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:topics. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Scan job reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/scan-requests/{scanJobId}/status')
  Future<ScanStatusResponseDto> scanStatusControllerGet({
    @Path('scanJobId') required String scanJobId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// List scan requests for a source binding.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:topics. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Scan request reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/source-bindings/{sourceBindingId}/scan-requests')
  Future<ListScanRequestsResponseDto> scanRequestControllerList({
    @Path('sourceBindingId') required String sourceBindingId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Request a scan for a source binding.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:scan_requests. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Manual scan requests require owner, admin or member. Required when Authorization bearer API key is not supplied.
  @POST('/source-bindings/{sourceBindingId}/scan-requests')
  Future<RequestScanResponseDto> scanRequestControllerCreate({
    @Path('sourceBindingId') required String sourceBindingId,
    @Header('idempotency-key') required String idempotencyKey,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('x-correlation-id') String? xCorrelationId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
