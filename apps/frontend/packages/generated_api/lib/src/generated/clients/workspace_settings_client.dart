// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/update_workspace_digest_preference_request_dto.dart';
import '../models/update_workspace_telemetry_consent_request_dto.dart';
import '../models/workspace_settings_response_dto.dart';

part 'workspace_settings_client.g.dart';

@RestApi()
abstract class WorkspaceSettingsClient {
  factory WorkspaceSettingsClient(Dio dio, {String? baseUrl}) =
      _WorkspaceSettingsClient;

  /// Get workspace settings for the current tenant/workspace.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:delivery_status. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Settings reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/workspace-settings')
  Future<WorkspaceSettingsResponseDto> workspaceSettingsControllerGet({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
    @Header('x-correlation-id') String? xCorrelationId,
  });

  /// Update workspace digest preference.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:delivery_status. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Settings writes allow owner, admin or member. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @PATCH('/workspace-settings/digest')
  Future<WorkspaceSettingsResponseDto> workspaceSettingsControllerUpdateDigest({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required UpdateWorkspaceDigestPreferenceRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
    @Header('x-correlation-id') String? xCorrelationId,
  });

  /// Update workspace telemetry consent preference.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:delivery_status. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Settings writes allow owner, admin or member. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @PATCH('/workspace-settings/telemetry')
  Future<WorkspaceSettingsResponseDto>
  workspaceSettingsControllerUpdateTelemetry({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required UpdateWorkspaceTelemetryConsentRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
    @Header('x-correlation-id') String? xCorrelationId,
  });
}
