import 'package:social_monitor_feed/src/domain/entities/feed_mention.dart';
import 'package:social_monitor_feed/src/domain/value_objects/mention_id.dart';
import 'package:social_monitor_feed/src/domain/value_objects/mention_sentiment.dart';
import 'package:social_monitor_feed/src/domain/value_objects/mention_triage_state.dart';
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
