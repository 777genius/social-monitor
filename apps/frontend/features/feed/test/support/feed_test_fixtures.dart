import 'package:social_monitor_feed/src/domain/entities/feed_item.dart';
import 'package:social_monitor_feed/src/domain/entities/feed_mention.dart';
import 'package:social_monitor_feed/src/domain/value_objects/feed_item_id.dart';
import 'package:social_monitor_feed/src/domain/value_objects/feed_provider_metadata.dart';
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
  String topicId = 'topic-demo',
  String sourceItemId = 'reddit-post-1',
  String sourceBindingId = 'binding-reddit-demo',
  String providerKey = 'reddit',
  String canonicalUrl = 'https://reddit.com/comments/demo1',
  String title = 'Why pricing changes increased conversions',
  String bodyPreview =
      'Users compare pricing changes and discuss conversion impact.',
  String? authorHandle = 'u/startups',
  Object? providerMetadata,
  DateTime? publishedAt,
  DateTime? observedAt,
}) {
  return FeedItemApiDto(
    id: id,
    topicId: topicId,
    sourceItemId: sourceItemId,
    sourceBindingId: sourceBindingId,
    providerKey: providerKey,
    canonicalUrl: canonicalUrl,
    title: title,
    bodyPreview: bodyPreview,
    authorHandle: authorHandle,
    providerMetadata: providerMetadata,
    publishedAt: publishedAt ?? DateTime.utc(2026, 6, 23, 11),
    observedAt: observedAt ?? DateTime.utc(2026, 6, 23, 12),
  );
}

FeedItem feedItem({
  String id = 'feed-1',
  String topicId = 'topic-demo',
  String sourceItemId = 'reddit-post-1',
  String sourceBindingId = 'binding-reddit-demo',
  String providerKey = 'reddit',
  String canonicalUrl = 'https://reddit.com/comments/demo1',
  String title = 'Why pricing changes increased conversions',
  String bodyPreview =
      'Users compare pricing changes and discuss conversion impact.',
  String? authorHandle = 'u/startups',
  Object? providerMetadata,
  DateTime? publishedAt,
  DateTime? observedAt,
}) {
  return FeedItem(
    id: FeedItemId(id),
    topicId: topicId,
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
    publishedAt: publishedAt ?? DateTime.utc(2026, 6, 23, 11),
    observedAt: observedAt ?? DateTime.utc(2026, 6, 23, 12),
  );
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
    },
    'trend': {
      'totalStars': totalStars,
      'stars24h': stars24h,
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
