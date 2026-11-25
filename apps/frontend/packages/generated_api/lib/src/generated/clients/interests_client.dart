// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/create_interest_request_dto.dart';
import '../models/create_interest_response_dto.dart';
import '../models/interest_response_dto.dart';
import '../models/list_interests_response_dto.dart';
import '../models/update_interest_request_dto.dart';

part 'interests_client.g.dart';

@RestApi()
abstract class InterestsClient {
  factory InterestsClient(Dio dio, {String? baseUrl}) = _InterestsClient;

  /// List interests inside the current tenant/workspace.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:interests. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Interest reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/interests')
  Future<ListInterestsResponseDto> interestControllerList({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Create an interest inside the current tenant/workspace.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:interests. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Interest creation requires owner or admin. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @POST('/interests')
  Future<CreateInterestResponseDto> interestControllerCreate({
    @Header('idempotency-key') required String idempotencyKey,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required CreateInterestRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Archive an interest inside the current tenant/workspace.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:interests. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Interest archives require owner or admin. Required when Authorization bearer API key is not supplied.
  @DELETE('/interests/{interestId}')
  Future<InterestResponseDto> interestControllerArchive({
    @Path('interestId') required String interestId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Update an interest inside the current tenant/workspace.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:interests. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Interest updates require owner or admin. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @PATCH('/interests/{interestId}')
  Future<InterestResponseDto> interestControllerUpdate({
    @Path('interestId') required String interestId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required UpdateInterestRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
