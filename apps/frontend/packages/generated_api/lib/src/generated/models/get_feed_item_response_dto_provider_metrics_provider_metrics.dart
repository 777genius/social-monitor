// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'git_hub_repository_provider_metrics_dto_content_type_content_type.dart';
import 'git_hub_repository_provider_metrics_dto_evidence_source_evidence_source.dart';
import 'git_hub_repository_provider_metrics_dto_kind_kind.dart';
import 'git_hub_repository_provider_metrics_dto_provider_key_provider_key.dart';
import 'feed_metric_delta_dto.dart';
import 'git_hub_trending_repository_provider_metrics_dto_content_type_content_type.dart';
import 'git_hub_trending_repository_provider_metrics_dto_kind_kind.dart';
import 'git_hub_trending_repository_provider_metrics_dto_provider_key_provider_key.dart';
import 'git_hub_trending_repository_provider_metrics_dto_window_window.dart';
import 'hacker_news_story_provider_metrics_dto_content_type_content_type.dart';
import 'hacker_news_story_provider_metrics_dto_kind_kind.dart';
import 'hacker_news_story_provider_metrics_dto_provider_key_provider_key.dart';
import 'reddit_comment_provider_metrics_dto_content_type_content_type.dart';
import 'reddit_comment_provider_metrics_dto_kind_kind.dart';
import 'reddit_comment_provider_metrics_dto_provider_key_provider_key.dart';
import 'reddit_comment_provider_metrics_dto_role_role.dart';
import 'reddit_comment_provider_metrics_dto_score_confidence_score_confidence.dart';
import 'reddit_post_provider_metrics_dto_content_type_content_type.dart';
import 'reddit_post_provider_metrics_dto_kind_kind.dart';
import 'reddit_post_provider_metrics_dto_provider_key_provider_key.dart';
import 'x_post_provider_metrics_dto_content_type_content_type.dart';
import 'x_post_provider_metrics_dto_kind_kind.dart';
import 'x_post_provider_metrics_dto_provider_key_provider_key.dart';

part 'get_feed_item_response_dto_provider_metrics_provider_metrics.g.dart';

@JsonSerializable(createFactory: false)
sealed class GetFeedItemResponseDtoProviderMetricsProviderMetrics {
  const GetFeedItemResponseDtoProviderMetricsProviderMetrics();

  factory GetFeedItemResponseDtoProviderMetricsProviderMetrics.fromJson(
    Map<String, dynamic> json,
  ) =>
      GetFeedItemResponseDtoProviderMetricsProviderMetricsUnionDeserializer.tryDeserialize(
        json,
      );

  Map<String, dynamic> toJson();
}

extension GetFeedItemResponseDtoProviderMetricsProviderMetricsUnionDeserializer
    on GetFeedItemResponseDtoProviderMetricsProviderMetrics {
  static GetFeedItemResponseDtoProviderMetricsProviderMetrics tryDeserialize(
    Map<String, dynamic> json, {
    String key = 'kind',
    Map<Type, Object?>? mapping,
  }) {
    final mappingFallback = const <Type, Object?>{
      GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepository:
          'github_repository',
      GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepository:
          'github_trending_repository',
      GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStory:
          'hacker_news_story',
      GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditComment:
          'reddit_comment',
      GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPost:
          'reddit_post',
      GetFeedItemResponseDtoProviderMetricsProviderMetricsXPost: 'x_post',
    };
    final value = json[key];
    final effective = mapping ?? mappingFallback;
    return switch (value) {
      _
          when value ==
              effective[GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepository] =>
        GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepository.fromJson(
          json,
        ),
      _
          when value ==
              effective[GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepository] =>
        GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepository.fromJson(
          json,
        ),
      _
          when value ==
              effective[GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStory] =>
        GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStory.fromJson(
          json,
        ),
      _
          when value ==
              effective[GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditComment] =>
        GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditComment.fromJson(
          json,
        ),
      _
          when value ==
              effective[GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPost] =>
        GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPost.fromJson(
          json,
        ),
      _
          when value ==
              effective[GetFeedItemResponseDtoProviderMetricsProviderMetricsXPost] =>
        GetFeedItemResponseDtoProviderMetricsProviderMetricsXPost.fromJson(
          json,
        ),
      _ => throw FormatException(
        'Unknown discriminator value "${json[key]}" for GetFeedItemResponseDtoProviderMetricsProviderMetrics',
      ),
    };
  }
}

@JsonSerializable()
class GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepository
    extends GetFeedItemResponseDtoProviderMetricsProviderMetrics {
  final DateTime? checkedAt;
  final GitHubRepositoryProviderMetricsDtoContentTypeContentType contentType;
  final String evidenceLabel;
  final GitHubRepositoryProviderMetricsDtoEvidenceSourceEvidenceSource
  evidenceSource;
  final num forks;
  final GitHubRepositoryProviderMetricsDtoKindKind kind;
  final GitHubRepositoryProviderMetricsDtoProviderKeyProviderKey providerKey;
  final String? source;
  final String sourceKey;
  final num stars;
  final List<FeedMetricDeltaDto> trendDeltas;
  final FeedMetricDeltaDto trendingDelta;

  const GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepository({
    required this.checkedAt,
    required this.contentType,
    required this.evidenceLabel,
    required this.evidenceSource,
    required this.forks,
    required this.kind,
    required this.providerKey,
    required this.source,
    required this.sourceKey,
    required this.stars,
    required this.trendDeltas,
    required this.trendingDelta,
  });

  factory GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepository.fromJson(
    Map<String, dynamic> json,
  ) =>
      _$GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepositoryFromJson(
        json,
      );

  @override
  Map<String, dynamic> toJson() =>
      _$GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepositoryToJson(
        this,
      );
}

@JsonSerializable()
class GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepository
    extends GetFeedItemResponseDtoProviderMetricsProviderMetrics {
  final GitHubTrendingRepositoryProviderMetricsDtoContentTypeContentType
  contentType;
  final num forks;
  final GitHubTrendingRepositoryProviderMetricsDtoKindKind kind;
  final GitHubTrendingRepositoryProviderMetricsDtoProviderKeyProviderKey
  providerKey;
  final num rank;
  final String sourceKey;
  final num stars;
  final num starsGained;
  final GitHubTrendingRepositoryProviderMetricsDtoWindowWindow window;

  const GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepository({
    required this.contentType,
    required this.forks,
    required this.kind,
    required this.providerKey,
    required this.rank,
    required this.sourceKey,
    required this.stars,
    required this.starsGained,
    required this.window,
  });

  factory GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepository.fromJson(
    Map<String, dynamic> json,
  ) =>
      _$GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepositoryFromJson(
        json,
      );

  @override
  Map<String, dynamic> toJson() =>
      _$GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepositoryToJson(
        this,
      );
}

@JsonSerializable()
class GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStory
    extends GetFeedItemResponseDtoProviderMetricsProviderMetrics {
  final num comments;
  final HackerNewsStoryProviderMetricsDtoContentTypeContentType contentType;
  final HackerNewsStoryProviderMetricsDtoKindKind kind;
  final num points;
  final HackerNewsStoryProviderMetricsDtoProviderKeyProviderKey providerKey;
  final String sourceKey;

  const GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStory({
    required this.comments,
    required this.contentType,
    required this.kind,
    required this.points,
    required this.providerKey,
    required this.sourceKey,
  });

  factory GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStory.fromJson(
    Map<String, dynamic> json,
  ) =>
      _$GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStoryFromJson(
        json,
      );

  @override
  Map<String, dynamic> toJson() =>
      _$GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStoryToJson(
        this,
      );
}

@JsonSerializable()
class GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditComment
    extends GetFeedItemResponseDtoProviderMetricsProviderMetrics {
  final RedditCommentProviderMetricsDtoContentTypeContentType contentType;
  final num depth;
  final RedditCommentProviderMetricsDtoKindKind kind;
  final RedditCommentProviderMetricsDtoProviderKeyProviderKey providerKey;
  final num replies;
  final RedditCommentProviderMetricsDtoRoleRole role;
  final num score;
  final RedditCommentProviderMetricsDtoScoreConfidenceScoreConfidence
  scoreConfidence;
  final String sourceKey;

  const GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditComment({
    required this.contentType,
    required this.depth,
    required this.kind,
    required this.providerKey,
    required this.replies,
    required this.role,
    required this.score,
    required this.scoreConfidence,
    required this.sourceKey,
  });

  factory GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditComment.fromJson(
    Map<String, dynamic> json,
  ) =>
      _$GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditCommentFromJson(
        json,
      );

  @override
  Map<String, dynamic> toJson() =>
      _$GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditCommentToJson(
        this,
      );
}

@JsonSerializable()
class GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPost
    extends GetFeedItemResponseDtoProviderMetricsProviderMetrics {
  final num comments;
  final RedditPostProviderMetricsDtoContentTypeContentType contentType;
  final RedditPostProviderMetricsDtoKindKind kind;
  final RedditPostProviderMetricsDtoProviderKeyProviderKey providerKey;
  final num score;
  final String sourceKey;
  final num? upvoteRatio;

  const GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPost({
    required this.comments,
    required this.contentType,
    required this.kind,
    required this.providerKey,
    required this.score,
    required this.sourceKey,
    required this.upvoteRatio,
  });

  factory GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPost.fromJson(
    Map<String, dynamic> json,
  ) => _$GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPostFromJson(
    json,
  );

  @override
  Map<String, dynamic> toJson() =>
      _$GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPostToJson(
        this,
      );
}

@JsonSerializable()
class GetFeedItemResponseDtoProviderMetricsProviderMetricsXPost
    extends GetFeedItemResponseDtoProviderMetricsProviderMetrics {
  final num bookmarks;
  final XPostProviderMetricsDtoContentTypeContentType contentType;
  final num impressions;
  final XPostProviderMetricsDtoKindKind kind;
  final num likes;
  final XPostProviderMetricsDtoProviderKeyProviderKey providerKey;
  final num quotes;
  final num replies;
  final num reposts;
  final String sourceKey;

  const GetFeedItemResponseDtoProviderMetricsProviderMetricsXPost({
    required this.bookmarks,
    required this.contentType,
    required this.impressions,
    required this.kind,
    required this.likes,
    required this.providerKey,
    required this.quotes,
    required this.replies,
    required this.reposts,
    required this.sourceKey,
  });

  factory GetFeedItemResponseDtoProviderMetricsProviderMetricsXPost.fromJson(
    Map<String, dynamic> json,
  ) =>
      _$GetFeedItemResponseDtoProviderMetricsProviderMetricsXPostFromJson(json);

  @override
  Map<String, dynamic> toJson() =>
      _$GetFeedItemResponseDtoProviderMetricsProviderMetricsXPostToJson(this);
}
