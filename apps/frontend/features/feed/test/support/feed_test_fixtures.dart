import 'package:social_monitor_feed/src/domain/entities/feed_item.dart';
import 'package:social_monitor_feed/src/domain/entities/feed_mention.dart';
import 'package:social_monitor_feed/src/domain/value_objects/feed_item_id.dart';
import 'package:social_monitor_feed/src/domain/value_objects/feed_provider_metadata.dart';
import 'package:social_monitor_feed/src/domain/value_objects/feed_provider_metrics.dart';
import 'package:social_monitor_feed/src/domain/value_objects/feed_signal_snapshot.dart';
import 'package:social_monitor_feed/src/domain/value_objects/mention_id.dart';
import 'package:social_monitor_feed/src/domain/value_objects/mention_sentiment.dart';
import 'package:social_monitor_feed/src/domain/value_objects/mention_triage_state.dart';
import 'package:social_monitor_feed/src/infrastructure/api/feed_item_api_dto.dart';
import 'package:social_monitor_feed/src/infrastructure/api/feed_mention_api_dto.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

const feedWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-demo',
  workspaceId: 'workspace-demo',
);

FeedMentionApiDto feedMentionApiDto({
  String id = 'm-1',
  String title = 'Pricing concern on Reddit',
  String sourceName = 'Reddit',
  String sentiment = 'watch',
  String triageState = 'needs_triage',
  String rawEvidenceText = 'Users are comparing competitor pricing tiers.',
  String provenanceLabel = 'Reddit thread',
}) {
  return FeedMentionApiDto(
    id: id,
    title: title,
    sourceName: sourceName,
    sentiment: sentiment,
    triageState: triageState,
    rawEvidenceText: rawEvidenceText,
    provenanceLabel: provenanceLabel,
  );
}

FeedMention feedMention({
  String id = 'm-1',
  String title = 'Pricing concern on Reddit',
  String sourceName = 'Reddit',
  MentionSentiment sentiment = MentionSentiment.watch,
  MentionTriageState triageState = MentionTriageState.needsTriage,
  String safeEvidencePreview = 'Users are comparing competitor pricing tiers.',
  String provenanceLabel = 'Reddit thread',
}) {
  return FeedMention(
    id: MentionId(id),
    title: title,
    sourceName: sourceName,
    sentiment: sentiment,
    triageState: triageState,
    safeEvidencePreview: safeEvidencePreview,
    provenanceLabel: provenanceLabel,
  );
}

PageResult<FeedMention> feedMentionPage(
  List<FeedMention> items, {
  String? nextCursor,
  PageRequest request = const PageRequest(),
}) {
  return PageResult<FeedMention>(
    items: items,
    request: request,
    nextCursor: nextCursor,
  );
}

FeedItemApiDto feedItemApiDto({
  String id = 'feed-1',
  String interestId = 'topic-demo',
  String sourceItemId = 'reddit-post-1',
  String sourceBindingId = 'binding-reddit-demo',
  String providerKey = 'reddit',
  String canonicalUrl = 'https://reddit.com/comments/demo1',
  String title = 'Why pricing changes increased conversions',
  String bodyPreview =
      'Users compare pricing changes and discuss conversion impact.',
  String? authorHandle = 'u/startups',
  Object? providerMetadata,
  Object? providerMetrics,
  FeedSignalApiDto? normalizedSignal,
  DateTime? publishedAt,
  DateTime? observedAt,
}) {
  return FeedItemApiDto(
    id: id,
    interestId: interestId,
    sourceItemId: sourceItemId,
    sourceBindingId: sourceBindingId,
    providerKey: providerKey,
    canonicalUrl: canonicalUrl,
    title: title,
    bodyPreview: bodyPreview,
    authorHandle: authorHandle,
    normalizedSignal: normalizedSignal,
    providerMetadata: providerMetadata,
    providerMetrics: providerMetrics,
    publishedAt: publishedAt ?? DateTime.utc(2026, 6, 23, 11),
    observedAt: observedAt ?? DateTime.utc(2026, 6, 23, 12),
  );
}

FeedItem feedItem({
  String id = 'feed-1',
  String interestId = 'topic-demo',
  String sourceItemId = 'reddit-post-1',
  String sourceBindingId = 'binding-reddit-demo',
  String providerKey = 'reddit',
  String canonicalUrl = 'https://reddit.com/comments/demo1',
  String title = 'Why pricing changes increased conversions',
  String bodyPreview =
      'Users compare pricing changes and discuss conversion impact.',
  String? authorHandle = 'u/startups',
  Object? providerMetadata,
  Object? providerMetrics,
  FeedSignalSnapshot? normalizedSignal,
  DateTime? publishedAt,
  DateTime? observedAt,
}) {
  return FeedItem(
    id: FeedItemId(id),
    interestId: interestId,
    sourceItemId: sourceItemId,
    sourceBindingId: sourceBindingId,
    providerKey: providerKey,
    canonicalUrl: canonicalUrl,
    title: title,
    bodyPreview: bodyPreview,
    authorHandle: authorHandle,
    providerMetadata: providerMetadata == null
        ? null
        : feedProviderMetadataFromApi(providerMetadata),
    providerMetrics: providerMetrics == null
        ? null
        : feedProviderMetricsFromApi(providerMetrics),
    normalizedSignal: normalizedSignal,
    publishedAt: publishedAt ?? DateTime.utc(2026, 6, 23, 11),
    observedAt: observedAt ?? DateTime.utc(2026, 6, 23, 12),
  );
}

FeedSignalApiDto feedSignalApiDto({
  num score = 84,
  String band = 'high',
  num confidence = 0.72,
  String basis = 'cohort_baseline_v1',
  DateTime? computedAt,
  String providerKey = 'reddit',
  String sourceKey = 'r/startups',
  String contentType = 'post',
  String ageBucket = '1-3h',
  String baselineWindow = '24h',
  num sampleSize = 24,
  num percentile = 0.91,
  num zScore = 1.2,
  String fallback = 'exact',
}) {
  return FeedSignalApiDto(
    score: score,
    band: band,
    confidence: confidence,
    basis: basis,
    computedAt: computedAt ?? DateTime.utc(2026, 6, 23, 12),
    cohort: FeedSignalCohortApiDto(
      providerKey: providerKey,
      sourceKey: sourceKey,
      contentType: contentType,
      ageBucket: ageBucket,
      baselineWindow: baselineWindow,
      sampleSize: sampleSize,
      percentile: percentile,
      zScore: zScore,
      fallback: fallback,
    ),
  );
}

FeedSignalSnapshot feedSignalSnapshot({
  int score = 84,
  FeedSignalBand band = FeedSignalBand.high,
  double confidence = 0.72,
  String sourceKey = 'r/startups',
}) {
  return FeedSignalSnapshot(
    score: score,
    band: band,
    confidence: confidence,
    basis: 'cohort_baseline_v1',
    computedAt: DateTime.utc(2026, 6, 23, 12),
    cohort: FeedSignalCohort(
      providerKey: 'reddit',
      sourceKey: sourceKey,
      contentType: 'post',
      ageBucket: '1-3h',
      baselineWindow: '24h',
      sampleSize: 24,
      percentile: 0.91,
      zScore: 1.2,
      fallback: 'exact',
    ),
  );
}

Map<String, Object?> redditPostMetricsFixture({
  int score = 55,
  int comments = 18,
  double upvoteRatio = 0.91,
  String sourceKey = 'r/startups',
}) {
  return {
    'kind': 'reddit_post',
    'providerKey': 'reddit',
    'sourceKey': sourceKey,
    'contentType': 'post',
    'score': score,
    'comments': comments,
    'upvoteRatio': upvoteRatio,
  };
}

Map<String, Object?> githubRepositoryMetricsFixture({
  int stars = 54000,
  int forks = 6100,
  int delta = 210,
  int delta48h = 360,
  int delta7d = 1200,
  int delta30d = 4800,
  int delta90d = 11000,
  String window = '24h',
}) {
  return {
    'kind': 'github_repository',
    'providerKey': 'github-repo-radar',
    'sourceKey': 'repo-trending:$window',
    'contentType': 'repository',
    'evidenceSource': 'gh_archive_watch_event',
    'evidenceLabel': 'GH Archive WatchEvent - hourly updated',
    'stars': stars,
    'forks': forks,
    'checkedAt': '2026-06-23T12:00:00.000Z',
    'source': 'gh_archive_bigquery_plus_github_live',
    'trendingDelta': {'window': window, 'value': delta},
    'trendDeltas': [
      {'window': '24h', 'value': delta},
      {'window': '48h', 'value': delta48h},
      {'window': '7d', 'value': delta7d},
      {'window': '30d', 'value': delta30d},
      {'window': '90d', 'value': delta90d},
    ],
  };
}

Map<String, Object?> githubTrendingRepositoryMetricsFixture({
  int stars = 18398,
  int forks = 2113,
  int rank = 1,
  int starsGained = 3703,
  String window = 'daily',
}) {
  return {
    'kind': 'github_trending_repository',
    'providerKey': 'github-trending-page',
    'sourceKey': 'github-trending-page:$window:language:python',
    'contentType': 'repository',
    'stars': stars,
    'forks': forks,
    'rank': rank,
    'starsGained': starsGained,
    'window': window,
  };
}

Map<String, Object?> githubRepositoryTrendMetadataFixture({
  String fullName = 'openai/codex',
  String url = 'https://github.com/openai/codex',
  String description = 'AI coding agent CLI and developer workflow tooling.',
  String language = 'TypeScript',
  List<String> topics = const ['ai', 'agents', 'developer-tools'],
  String license = 'Apache-2.0',
  int totalStars = 54000,
  int stars24h = 210,
  int stars48h = 360,
  int stars7d = 1200,
  int stars30d = 4800,
  int stars90d = 11000,
  int rank = 1,
  String primaryWindow = '24h',
}) {
  return {
    'kind': 'github_repository_trend',
    'repository': {
      'fullName': fullName,
      'url': url,
      'description': description,
      'language': language,
      'topics': topics,
      'license': license,
      'forksCount': 6100,
    },
    'trend': {
      'totalStars': totalStars,
      'stars24h': stars24h,
      'stars48h': stars48h,
      'stars7d': stars7d,
      'stars30d': stars30d,
      'stars90d': stars90d,
      'rank': rank,
      'primaryWindow': primaryWindow,
      'checkedAt': '2026-06-23T12:00:00.000Z',
      'source': 'gh_archive_bigquery_plus_github_live',
    },
  };
}

PageResult<FeedItem> feedItemPage(
  List<FeedItem> items, {
  String? nextCursor,
  PageRequest request = const PageRequest(),
}) {
  return PageResult<FeedItem>(
    items: items,
    request: request,
    nextCursor: nextCursor,
  );
}
