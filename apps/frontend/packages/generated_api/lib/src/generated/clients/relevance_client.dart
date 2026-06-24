// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/build_personalized_digest_response_dto.dart';
import '../models/rank_feed_items_response_dto.dart';
import '../models/record_relevance_feedback_request_dto.dart';
import '../models/record_relevance_feedback_response_dto.dart';
import '../models/upsert_user_relevance_profile_request_dto.dart';
import '../models/upsert_user_relevance_profile_response_dto.dart';

part 'relevance_client.g.dart';

@RestApi()
abstract class RelevanceClient {
  factory RelevanceClient(Dio dio, {String? baseUrl}) = _RelevanceClient;

  /// Build a personalized digest candidate set for one user and time window.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:feed. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Personalized digest reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/relevance/users/{userId}/digest')
  Future<BuildPersonalizedDigestResponseDto> relevanceControllerDigest({
    @Path('userId') required String userId,
    @Query('windowEndedAt') required String windowEndedAt,
    @Query('windowStartedAt') required String windowStartedAt,
    @Query('topicIds') required String topicIds,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('limit') num? limit,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Rank feed items for one user with dedupe, clustering and source safety metadata.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:feed. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Personalized feed reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/relevance/users/{userId}/feed')
  Future<RankFeedItemsResponseDto> relevanceControllerFeed({
    @Path('userId') required String userId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('observedAfter') String? observedAfter,
    @Query('limit') num? limit,
    @Query('topicId') String? topicId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Record relevance feedback and update the user learning profile.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Relevance feedback writes allow owner, admin or member. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @POST('/relevance/users/{userId}/feedback')
  Future<RecordRelevanceFeedbackResponseDto> relevanceControllerFeedback({
    @Path('userId') required String userId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required RecordRelevanceFeedbackRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Create or update personalized relevance weights for one user.
  ///
  /// [authorization] - Optional Bearer API key. Requires write:summaries. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Relevance profile writes allow owner, admin or member. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @PUT('/relevance/users/{userId}/profile')
  Future<UpsertUserRelevanceProfileResponseDto>
  relevanceControllerUpsertProfile({
    @Path('userId') required String userId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required UpsertUserRelevanceProfileRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
