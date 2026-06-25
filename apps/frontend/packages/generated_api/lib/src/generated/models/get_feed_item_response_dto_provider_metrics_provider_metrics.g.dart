// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'get_feed_item_response_dto_provider_metrics_provider_metrics.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Map<String, dynamic>
_$GetFeedItemResponseDtoProviderMetricsProviderMetricsToJson(
  GetFeedItemResponseDtoProviderMetricsProviderMetrics instance,
) => <String, dynamic>{};

GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepository
_$GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepositoryFromJson(
  Map<String, dynamic> json,
) => GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepository(
  checkedAt: json['checkedAt'] == null
      ? null
      : DateTime.parse(json['checkedAt'] as String),
  contentType:
      GitHubRepositoryProviderMetricsDtoContentTypeContentType.fromJson(
        json['contentType'] as String,
      ),
  evidenceLabel: json['evidenceLabel'] as String,
  evidenceSource:
      GitHubRepositoryProviderMetricsDtoEvidenceSourceEvidenceSource.fromJson(
        json['evidenceSource'] as String,
      ),
  forks: json['forks'] as num,
  kind: GitHubRepositoryProviderMetricsDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  providerKey:
      GitHubRepositoryProviderMetricsDtoProviderKeyProviderKey.fromJson(
        json['providerKey'] as String,
      ),
  source: json['source'] as String?,
  sourceKey: json['sourceKey'] as String,
  stars: json['stars'] as num,
  trendDeltas: (json['trendDeltas'] as List<dynamic>)
      .map((e) => FeedMetricDeltaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  trendingDelta: FeedMetricDeltaDto.fromJson(
    json['trendingDelta'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic>
_$GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepositoryToJson(
  GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepository instance,
) => <String, dynamic>{
  'checkedAt': instance.checkedAt?.toIso8601String(),
  'contentType': instance.contentType,
  'evidenceLabel': instance.evidenceLabel,
  'evidenceSource': instance.evidenceSource,
  'forks': instance.forks,
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'source': instance.source,
  'sourceKey': instance.sourceKey,
  'stars': instance.stars,
  'trendDeltas': instance.trendDeltas,
  'trendingDelta': instance.trendingDelta,
};

GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepository
_$GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepositoryFromJson(
  Map<String, dynamic> json,
) => GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepository(
  contentType:
      GitHubTrendingRepositoryProviderMetricsDtoContentTypeContentType.fromJson(
        json['contentType'] as String,
      ),
  forks: json['forks'] as num,
  kind: GitHubTrendingRepositoryProviderMetricsDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  providerKey:
      GitHubTrendingRepositoryProviderMetricsDtoProviderKeyProviderKey.fromJson(
        json['providerKey'] as String,
      ),
  rank: json['rank'] as num,
  sourceKey: json['sourceKey'] as String,
  stars: json['stars'] as num,
  starsGained: json['starsGained'] as num,
  window: GitHubTrendingRepositoryProviderMetricsDtoWindowWindow.fromJson(
    json['window'] as String,
  ),
);

Map<String, dynamic>
_$GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepositoryToJson(
  GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubTrendingRepository
  instance,
) => <String, dynamic>{
  'contentType': instance.contentType,
  'forks': instance.forks,
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'rank': instance.rank,
  'sourceKey': instance.sourceKey,
  'stars': instance.stars,
  'starsGained': instance.starsGained,
  'window': instance.window,
};

GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStory
_$GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStoryFromJson(
  Map<String, dynamic> json,
) => GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStory(
  comments: json['comments'] as num,
  contentType: HackerNewsStoryProviderMetricsDtoContentTypeContentType.fromJson(
    json['contentType'] as String,
  ),
  kind: HackerNewsStoryProviderMetricsDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  points: json['points'] as num,
  providerKey: HackerNewsStoryProviderMetricsDtoProviderKeyProviderKey.fromJson(
    json['providerKey'] as String,
  ),
  sourceKey: json['sourceKey'] as String,
);

Map<String, dynamic>
_$GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStoryToJson(
  GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStory instance,
) => <String, dynamic>{
  'comments': instance.comments,
  'contentType': instance.contentType,
  'kind': instance.kind,
  'points': instance.points,
  'providerKey': instance.providerKey,
  'sourceKey': instance.sourceKey,
};

GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPost
_$GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPostFromJson(
  Map<String, dynamic> json,
) => GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPost(
  comments: json['comments'] as num,
  contentType: RedditPostProviderMetricsDtoContentTypeContentType.fromJson(
    json['contentType'] as String,
  ),
  kind: RedditPostProviderMetricsDtoKindKind.fromJson(json['kind'] as String),
  providerKey: RedditPostProviderMetricsDtoProviderKeyProviderKey.fromJson(
    json['providerKey'] as String,
  ),
  score: json['score'] as num,
  sourceKey: json['sourceKey'] as String,
  upvoteRatio: json['upvoteRatio'] as num?,
);

Map<String, dynamic>
_$GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPostToJson(
  GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPost instance,
) => <String, dynamic>{
  'comments': instance.comments,
  'contentType': instance.contentType,
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'score': instance.score,
  'sourceKey': instance.sourceKey,
  'upvoteRatio': instance.upvoteRatio,
};

GetFeedItemResponseDtoProviderMetricsProviderMetricsXPost
_$GetFeedItemResponseDtoProviderMetricsProviderMetricsXPostFromJson(
  Map<String, dynamic> json,
) => GetFeedItemResponseDtoProviderMetricsProviderMetricsXPost(
  bookmarks: json['bookmarks'] as num,
  contentType: XPostProviderMetricsDtoContentTypeContentType.fromJson(
    json['contentType'] as String,
  ),
  impressions: json['impressions'] as num,
  kind: XPostProviderMetricsDtoKindKind.fromJson(json['kind'] as String),
  likes: json['likes'] as num,
  providerKey: XPostProviderMetricsDtoProviderKeyProviderKey.fromJson(
    json['providerKey'] as String,
  ),
  quotes: json['quotes'] as num,
  replies: json['replies'] as num,
  reposts: json['reposts'] as num,
  sourceKey: json['sourceKey'] as String,
);

Map<String, dynamic>
_$GetFeedItemResponseDtoProviderMetricsProviderMetricsXPostToJson(
  GetFeedItemResponseDtoProviderMetricsProviderMetricsXPost instance,
) => <String, dynamic>{
  'bookmarks': instance.bookmarks,
  'contentType': instance.contentType,
  'impressions': instance.impressions,
  'kind': instance.kind,
  'likes': instance.likes,
  'providerKey': instance.providerKey,
  'quotes': instance.quotes,
  'replies': instance.replies,
  'reposts': instance.reposts,
  'sourceKey': instance.sourceKey,
};
