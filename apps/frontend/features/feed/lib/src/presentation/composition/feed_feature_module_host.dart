import 'package:flutter/widgets.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/use_cases/list_feed_mentions_use_case.dart';
import '../../application/use_cases/triage_mention_use_case.dart';
import '../../infrastructure/api/feed_mention_api_dto.dart';
import '../../infrastructure/api_clients/in_memory_feed_api_client.dart';
import '../../infrastructure/repositories/generated_feed_review_catalog.dart';
import '../pages/feed_feature_page.dart';
import '../stores/feed_review_store.dart';

class FeedFeatureModuleHost extends StatefulWidget {
  const FeedFeatureModuleHost({super.key});

  @override
  State<FeedFeatureModuleHost> createState() => _FeedFeatureModuleHostState();
}

class _FeedFeatureModuleHostState extends State<FeedFeatureModuleHost> {
  late final FeedReviewStore _store;

  @override
  void initState() {
    super.initState();
    final catalog = GeneratedFeedReviewCatalog(
      apiClient: InMemoryFeedApiClient(items: _demoMentions),
    );
    _store = FeedReviewStore(
      listMentions: ListFeedMentionsUseCase(catalog),
      triageMention: TriageMentionUseCase(catalog),
      scope: const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
    );
  }

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FeedFeaturePage(store: _store);
  }
}

const _demoMentions = [
  FeedMentionApiDto(
    id: 'm-1',
    title: 'Pricing concern on Reddit',
    sourceName: 'Reddit',
    sentiment: 'watch',
    triageState: 'needs_triage',
    rawEvidenceText: 'Users are comparing competitor pricing tiers.',
    provenanceLabel: 'Reddit thread',
  ),
  FeedMentionApiDto(
    id: 'm-2',
    title: 'Positive launch mention',
    sourceName: 'RSS',
    sentiment: 'positive',
    triageState: 'needs_triage',
    rawEvidenceText: 'Launch coverage is positive across monitored feeds.',
    provenanceLabel: 'RSS item',
  ),
  FeedMentionApiDto(
    id: 'm-3',
    title: 'Integration request',
    sourceName: 'Hacker News',
    sentiment: 'opportunity',
    triageState: 'needs_triage',
    rawEvidenceText: 'Several comments request a native integration.',
    provenanceLabel: 'HN discussion',
  ),
];
