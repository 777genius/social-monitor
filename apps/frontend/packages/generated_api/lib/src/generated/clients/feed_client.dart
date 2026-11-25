// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/get_feed_item_response_dto.dart';
import '../models/list_feed_items_response_dto.dart';
import '../models/repository_trend_window.dart';

part 'feed_client.g.dart';

@RestApi()
abstract class FeedClient {
  factory FeedClient(Dio dio, {String? baseUrl}) = _FeedClient;

  /// List tenant/workspace feed items with cursor pagination.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:feed. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Feed reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/feed/items')
  Future<ListFeedItemsResponseDto> feedControllerList({
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Query('repositoryTopic') String? repositoryTopic,
    @Query('repositoryLanguage') String? repositoryLanguage,
    @Query('repositoryTrendWindow')
    RepositoryTrendWindow? repositoryTrendWindow,
    @Query('providerKey') String? providerKey,
    @Query('q') String? q,
    @Query('interestId') String? interestId,
    @Query('cursor') String? cursor,
    @Query('limit') num? limit,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });

  /// Get one tenant/workspace feed item by id.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:feed. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Feed reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  @GET('/feed/items/{feedItemId}')
  Future<GetFeedItemResponseDto> feedControllerGet({
    @Path('feedItemId') required String feedItemId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
