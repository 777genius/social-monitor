// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feed_item_dto_provider_metrics_provider_metrics.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Map<String, dynamic> _$FeedItemDtoProviderMetricsProviderMetricsToJson(
  FeedItemDtoProviderMetricsProviderMetrics instance,
) => <String, dynamic>{};

FeedItemDtoProviderMetricsProviderMetricsGithubRepository
_$FeedItemDtoProviderMetricsProviderMetricsGithubRepositoryFromJson(
  Map<String, dynamic> json,
) => FeedItemDtoProviderMetricsProviderMetricsGithubRepository(
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
_$FeedItemDtoProviderMetricsProviderMetricsGithubRepositoryToJson(
  FeedItemDtoProviderMetricsProviderMetricsGithubRepository instance,
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

FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepository
_$FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepositoryFromJson(
  Map<String, dynamic> json,
) => FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepository(
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
_$FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepositoryToJson(
  FeedItemDtoProviderMetricsProviderMetricsGithubTrendingRepository instance,
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

FeedItemDtoProviderMetricsProviderMetricsHackerNewsStory
_$FeedItemDtoProviderMetricsProviderMetricsHackerNewsStoryFromJson(
  Map<String, dynamic> json,
) => FeedItemDtoProviderMetricsProviderMetricsHackerNewsStory(
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
_$FeedItemDtoProviderMetricsProviderMetricsHackerNewsStoryToJson(
  FeedItemDtoProviderMetricsProviderMetricsHackerNewsStory instance,
) => <String, dynamic>{
  'comments': instance.comments,
  'contentType': instance.contentType,
  'kind': instance.kind,
  'points': instance.points,
  'providerKey': instance.providerKey,
  'sourceKey': instance.sourceKey,
};

FeedItemDtoProviderMetricsProviderMetricsRedditComment
_$FeedItemDtoProviderMetricsProviderMetricsRedditCommentFromJson(
  Map<String, dynamic> json,
) => FeedItemDtoProviderMetricsProviderMetricsRedditComment(
  contentType: RedditCommentProviderMetricsDtoContentTypeContentType.fromJson(
    json['contentType'] as String,
  ),
  depth: json['depth'] as num,
  kind: RedditCommentProviderMetricsDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  providerKey: RedditCommentProviderMetricsDtoProviderKeyProviderKey.fromJson(
    json['providerKey'] as String,
  ),
  replies: json['replies'] as num,
  role: RedditCommentProviderMetricsDtoRoleRole.fromJson(
    json['role'] as String,
  ),
  score: json['score'] as num,
  scoreConfidence:
      RedditCommentProviderMetricsDtoScoreConfidenceScoreConfidence.fromJson(
        json['scoreConfidence'] as String,
      ),
  sourceKey: json['sourceKey'] as String,
);

Map<String, dynamic>
_$FeedItemDtoProviderMetricsProviderMetricsRedditCommentToJson(
  FeedItemDtoProviderMetricsProviderMetricsRedditComment instance,
) => <String, dynamic>{
  'contentType': instance.contentType,
  'depth': instance.depth,
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'replies': instance.replies,
  'role': instance.role,
  'score': instance.score,
  'scoreConfidence': instance.scoreConfidence,
  'sourceKey': instance.sourceKey,
};

FeedItemDtoProviderMetricsProviderMetricsRedditPost
_$FeedItemDtoProviderMetricsProviderMetricsRedditPostFromJson(
  Map<String, dynamic> json,
) => FeedItemDtoProviderMetricsProviderMetricsRedditPost(
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
_$FeedItemDtoProviderMetricsProviderMetricsRedditPostToJson(
  FeedItemDtoProviderMetricsProviderMetricsRedditPost instance,
) => <String, dynamic>{
  'comments': instance.comments,
  'contentType': instance.contentType,
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'score': instance.score,
  'sourceKey': instance.sourceKey,
  'upvoteRatio': instance.upvoteRatio,
};

FeedItemDtoProviderMetricsProviderMetricsXPost
_$FeedItemDtoProviderMetricsProviderMetricsXPostFromJson(
  Map<String, dynamic> json,
) => FeedItemDtoProviderMetricsProviderMetricsXPost(
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

Map<String, dynamic> _$FeedItemDtoProviderMetricsProviderMetricsXPostToJson(
  FeedItemDtoProviderMetricsProviderMetricsXPost instance,
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
