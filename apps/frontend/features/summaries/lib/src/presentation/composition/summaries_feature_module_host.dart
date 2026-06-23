import 'package:flutter/widgets.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/use_cases/list_summaries_use_case.dart';
import '../../application/use_cases/load_summary_detail_use_case.dart';
import '../../application/use_cases/regenerate_summary_use_case.dart';
import '../../application/use_cases/submit_summary_feedback_use_case.dart';
import '../../infrastructure/api/summary_api_dto.dart';
import '../../infrastructure/api_clients/in_memory_summaries_api_client.dart';
import '../../infrastructure/repositories/generated_summary_review_catalog.dart';
import '../pages/summaries_feature_page.dart';
import '../stores/summaries_review_store.dart';

class SummariesFeatureModuleHost extends StatefulWidget {
  const SummariesFeatureModuleHost({super.key});

  @override
  State<SummariesFeatureModuleHost> createState() =>
      _SummariesFeatureModuleHostState();
}

class _SummariesFeatureModuleHostState
    extends State<SummariesFeatureModuleHost> {
  late final SummariesReviewStore _store;

  @override
  void initState() {
    super.initState();
    final catalog = GeneratedSummaryReviewCatalog(
      apiClient: InMemorySummariesApiClient(items: _demoSummaries),
    );
    _store = SummariesReviewStore(
      listSummaries: ListSummariesUseCase(catalog),
      loadSummaryDetail: LoadSummaryDetailUseCase(catalog),
      regenerateSummary: RegenerateSummaryUseCase(catalog),
      submitFeedback: SubmitSummaryFeedbackUseCase(catalog),
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
    return SummariesFeaturePage(store: _store);
  }
}

const _demoSummaries = [
  SummaryApiDto(
    id: 's-1',
    title: 'Weekly risk briefing',
    status: 'ready',
    bodyText:
        'Pricing pressure increased this week while launch sentiment stayed stable.',
    citations: [
      SummaryCitationApiDto(
        id: 'c-1',
        sourceLabel: 'Reddit thread',
        rawSnippet: 'Users compared competitor pricing tiers.',
      ),
      SummaryCitationApiDto(
        id: 'c-2',
        sourceLabel: 'RSS item',
        rawSnippet: 'Launch coverage remained positive.',
      ),
    ],
    freshnessLabel: 'Today',
    feedbackSubmitted: false,
  ),
  SummaryApiDto(
    id: 's-2',
    title: 'Launch sentiment pulse',
    status: 'generating',
    bodyText: 'A new pulse is being generated from reviewed mentions.',
    citations: [
      SummaryCitationApiDto(
        id: 'c-3',
        sourceLabel: 'Hacker News',
        rawSnippet: 'Commenters asked for native integrations.',
      ),
    ],
    freshnessLabel: 'Queued',
    feedbackSubmitted: false,
  ),
];
