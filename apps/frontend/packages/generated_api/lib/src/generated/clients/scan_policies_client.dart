// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/get_scan_policy_response_dto.dart';
import '../models/set_scan_policy_request_dto.dart';
import '../models/set_scan_policy_response_dto.dart';

part 'scan_policies_client.g.dart';

@RestApi()
abstract class ScanPoliciesClient {
  factory ScanPoliciesClient(Dio dio, {String? baseUrl}) = _ScanPoliciesClient;

  /// Get scan policy for a source binding.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:topics. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Scan policy reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/source-bindings/{sourceBindingId}/scan-policy')
  Future<GetScanPolicyResponseDto> scanPolicyControllerGet({
    @Path('sourceBindingId') required String sourceBindingId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Set scan policy for a source binding.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:source_bindings. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Scan policy changes require owner or admin. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @POST('/source-bindings/{sourceBindingId}/scan-policy')
  Future<SetScanPolicyResponseDto> scanPolicyControllerCreate({
    @Path('sourceBindingId') required String sourceBindingId,
    @Header('idempotency-key') required String idempotencyKey,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required SetScanPolicyRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
