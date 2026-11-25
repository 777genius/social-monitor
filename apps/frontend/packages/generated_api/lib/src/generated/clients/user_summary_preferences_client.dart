// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/get_effective_user_summary_preference_response_dto.dart';
import '../models/upsert_interest_user_summary_preference_request_dto.dart';
import '../models/upsert_user_summary_preference_response_dto.dart';

part 'user_summary_preferences_client.g.dart';

@RestApi()
abstract class UserSummaryPreferencesClient {
  factory UserSummaryPreferencesClient(Dio dio, {String? baseUrl}) =
      _UserSummaryPreferencesClient;

  /// Read the effective interest summary preference overlay for one user.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. User summary preference reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/interests/{interestId}/user-summary-preference')
  Future<GetEffectiveUserSummaryPreferenceResponseDto>
  userSummaryPreferencesControllerGetEffectiveInterestSummaryPreference({
    @Path('interestId') required String interestId,
    @Query('userId') required String userId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
    @Query('subscriptionId') String? subscriptionId,
  });

  /// Create or update the interest-level summary preference overlay for one user.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. User summary preference writes allow owner, admin or member. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @PUT('/interests/{interestId}/user-summary-preference')
  Future<UpsertUserSummaryPreferenceResponseDto>
  userSummaryPreferencesControllerUpsertInterestSummaryPreference({
    @Path('interestId') required String interestId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required UpsertInterestUserSummaryPreferenceRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
