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
import 'reddit_post_provider_metrics_dto_content_type_content_type.dart';
import 'reddit_post_provider_metrics_dto_kind_kind.dart';
import 'reddit_post_provider_metrics_dto_provider_key_provider_key.dart';
import 'x_post_provider_metrics_dto_content_type_content_type.dart';
import 'x_post_provider_metrics_dto_kind_kind.dart';
import 'x_post_provider_metrics_dto_provider_key_provider_key.dart';

part 'feed_item_dto_provider_metrics_provider_metrics.g.dart';

@JsonSerializable(createFactory: false)
sealed class FeedItemDtoProviderMetricsProviderMetrics {
  const FeedItemDtoProviderMetricsProviderMetrics();

  factory FeedItemDtoProviderMetricsProviderMetrics.fromJson(
    Map<String, dynamic> json,
  ) =>
      FeedItemDtoProviderMetricsProviderMetricsUnionDeserializer.tryDeserialize(
        json,
      );

  Map<String, dynamic> toJson();
}

extension FeedItemDtoProviderMetricsProviderMetricsUnionDeserializer
    on FeedItemDtoProviderMetricsProviderMetrics {
  static FeedItemDtoProviderMetricsProviderMetrics tryDeserialize(
    Map<String, dynamic> json, {
    String key = 'kind',
    Map<Type, Object?>? mapping,
  }) {
    final mappingFallback = const <Type, Object?>{
      FeedItemDtoProviderMetricsProviderMetricsGithubRepository:
          'github_repository',
      FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepository:
          'github_trending_repository',
      FeedItemDtoProviderMetricsProviderMetricsHackerNewsStory:
          'hacker_news_story',
      FeedItemDtoProviderMetricsProviderMetricsRedditPost: 'reddit_post',
      FeedItemDtoProviderMetricsProviderMetricsXPost: 'x_post',
    };
    final value = json[key];
    final effective = mapping ?? mappingFallback;
    return switch (value) {
      _
          when value ==
              effective[FeedItemDtoProviderMetricsProviderMetricsGithubRepository] =>
        FeedItemDtoProviderMetricsProviderMetricsGithubRepository.fromJson(
          json,
        ),
      _
          when value ==
              effective[FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepository] =>
        FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepository.fromJson(
          json,
        ),
      _
          when value ==
              effective[FeedItemDtoProviderMetricsProviderMetricsHackerNewsStory] =>
        FeedItemDtoProviderMetricsProviderMetricsHackerNewsStory.fromJson(json),
      _
          when value ==
              effective[FeedItemDtoProviderMetricsProviderMetricsRedditPost] =>
        FeedItemDtoProviderMetricsProviderMetricsRedditPost.fromJson(json),
      _
          when value ==
              effective[FeedItemDtoProviderMetricsProviderMetricsXPost] =>
        FeedItemDtoProviderMetricsProviderMetricsXPost.fromJson(json),
      _ => throw FormatException(
        'Unknown discriminator value "${json[key]}" for FeedItemDtoProviderMetricsProviderMetrics',
      ),
    };
  }
}

@JsonSerializable()
class FeedItemDtoProviderMetricsProviderMetricsGithubRepository
    extends FeedItemDtoProviderMetricsProviderMetrics {
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

  const FeedItemDtoProviderMetricsProviderMetricsGithubRepository({
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

  factory FeedItemDtoProviderMetricsProviderMetricsGithubRepository.fromJson(
    Map<String, dynamic> json,
  ) =>
      _$FeedItemDtoProviderMetricsProviderMetricsGithubRepositoryFromJson(json);

  @override
  Map<String, dynamic> toJson() =>
      _$FeedItemDtoProviderMetricsProviderMetricsGithubRepositoryToJson(this);
}

@JsonSerializable()
class FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepository
    extends FeedItemDtoProviderMetricsProviderMetrics {
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

  const FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepository({
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

  factory FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepository.fromJson(
    Map<String, dynamic> json,
  ) =>
      _$FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepositoryFromJson(
        json,
      );

  @override
  Map<String, dynamic> toJson() =>
      _$FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepositoryToJson(
        this,
      );
}

@JsonSerializable()
class FeedItemDtoProviderMetricsProviderMetricsHackerNewsStory
    extends FeedItemDtoProviderMetricsProviderMetrics {
  final num comments;
  final HackerNewsStoryProviderMetricsDtoContentTypeContentType contentType;
  final HackerNewsStoryProviderMetricsDtoKindKind kind;
  final num points;
  final HackerNewsStoryProviderMetricsDtoProviderKeyProviderKey providerKey;
  final String sourceKey;

  const FeedItemDtoProviderMetricsProviderMetricsHackerNewsStory({
    required this.comments,
    required this.contentType,
    required this.kind,
    required this.points,
    required this.providerKey,
    required this.sourceKey,
  });

  factory FeedItemDtoProviderMetricsProviderMetricsHackerNewsStory.fromJson(
    Map<String, dynamic> json,
  ) => _$FeedItemDtoProviderMetricsProviderMetricsHackerNewsStoryFromJson(json);

  @override
  Map<String, dynamic> toJson() =>
      _$FeedItemDtoProviderMetricsProviderMetricsHackerNewsStoryToJson(this);
}

@JsonSerializable()
class FeedItemDtoProviderMetricsProviderMetricsRedditPost
    extends FeedItemDtoProviderMetricsProviderMetrics {
  final num comments;
  final RedditPostProviderMetricsDtoContentTypeContentType contentType;
  final RedditPostProviderMetricsDtoKindKind kind;
  final RedditPostProviderMetricsDtoProviderKeyProviderKey providerKey;
  final num score;
  final String sourceKey;
  final num? upvoteRatio;

  const FeedItemDtoProviderMetricsProviderMetricsRedditPost({
    required this.comments,
    required this.contentType,
    required this.kind,
    required this.providerKey,
    required this.score,
    required this.sourceKey,
    required this.upvoteRatio,
  });

  factory FeedItemDtoProviderMetricsProviderMetricsRedditPost.fromJson(
    Map<String, dynamic> json,
  ) => _$FeedItemDtoProviderMetricsProviderMetricsRedditPostFromJson(json);

  @override
  Map<String, dynamic> toJson() =>
      _$FeedItemDtoProviderMetricsProviderMetricsRedditPostToJson(this);
}

@JsonSerializable()
class FeedItemDtoProviderMetricsProviderMetricsXPost
    extends FeedItemDtoProviderMetricsProviderMetrics {
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

  const FeedItemDtoProviderMetricsProviderMetricsXPost({
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

  factory FeedItemDtoProviderMetricsProviderMetricsXPost.fromJson(
    Map<String, dynamic> json,
  ) => _$FeedItemDtoProviderMetricsProviderMetricsXPostFromJson(json);

  @override
  Map<String, dynamic> toJson() =>
      _$FeedItemDtoProviderMetricsProviderMetricsXPostToJson(this);
}
