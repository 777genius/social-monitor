// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/create_source_credential_request_dto.dart';
import '../models/list_source_credentials_response_dto.dart';
import '../models/rotate_source_credential_request_dto.dart';
import '../models/source_credential_response_dto.dart';

part 'source_credentials_client.g.dart';

@RestApi()
abstract class SourceCredentialsClient {
  factory SourceCredentialsClient(Dio dio, {String? baseUrl}) =
      _SourceCredentialsClient;

  /// List source credentials without exposing secret material.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:interests. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Source credential reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/source-credentials')
  Future<ListSourceCredentialsResponseDto> sourceCredentialControllerList({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Query('providerKey') String? providerKey,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Create tenant-owned source credential metadata and encrypted secret material.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:source_bindings. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Source credential writes require owner or admin. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @POST('/source-credentials')
  Future<SourceCredentialResponseDto> sourceCredentialControllerCreate({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required CreateSourceCredentialRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Revoke a source credential and remove its active secret material.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:source_bindings. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Source credential writes require owner or admin. Required when Authorization bearer API key is not supplied.
  @POST('/source-credentials/{sourceCredentialId}/revoke')
  Future<SourceCredentialResponseDto> sourceCredentialControllerRevoke({
    @Path('sourceCredentialId') required String sourceCredentialId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Rotate encrypted secret material for an existing source credential.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:source_bindings. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Source credential writes require owner or admin. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @PATCH('/source-credentials/{sourceCredentialId}/rotate')
  Future<SourceCredentialResponseDto> sourceCredentialControllerRotate({
    @Path('sourceCredentialId') required String sourceCredentialId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required RotateSourceCredentialRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
