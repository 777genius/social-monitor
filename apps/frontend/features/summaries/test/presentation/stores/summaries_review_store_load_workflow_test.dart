import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/reader_source_launcher.dart';
import 'package:social_monitor_summaries/src/application/contracts/summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/application/use_cases/decide_topic_recommendation_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/list_summaries_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_post_ratings_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_summary_detail_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_topic_recommendations_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_history_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_job_status_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/open_reader_source_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/regenerate_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/request_workspace_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_post_rating_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_reader_action_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_summary_feedback_use_case.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/stores/summaries_review_store.dart';
import 'package:social_monitor_summaries/src/presentation/workflows/summaries_review_store_dependencies.dart';

import '../../support/deferred_summary_review_catalog.dart';
import '../../support/summaries_test_fixtures.dart';

void main() {
  test(
    'loads reader summary without eager generated summary history',
    () async {
      final catalog = DeferredSummaryReviewCatalog([
        generatedSummary(id: 's-legacy'),
      ], workspaceSummarySnapshot: _workspaceSnapshotWithReaderSummary());
      final store = _storeFromCatalog(catalog);

      await store.load();

      expect(catalog.workspaceSummaryLoadCount, 1);
      expect(catalog.summaryListLoadCount, 0);
      expect(catalog.workspaceSummaryHistoryLoadCount, 0);
      expect(
        store.listState,
        isA<InitialViewState<PageResult<GeneratedSummary>>>(),
      );
      final state =
          store.workspaceSummaryState
              as ReadyViewState<WorkspaceSummarySnapshot>;
      expect(state.value.current?.title, 'AI workspace summary');
    },
  );

  test('deduplicates reentrant primary reader summary loads', () async {
    final catalog = DeferredSummaryReviewCatalog([
      generatedSummary(id: 's-legacy'),
    ], deferWorkspaceSummary: true);
    final store = _storeFromCatalog(catalog);

    final first = store.load();
    final second = store.load();
    await Future<void>.delayed(Duration.zero);

    expect(catalog.pendingWorkspaceSummarys, hasLength(1));
    catalog.pendingWorkspaceSummarys.single.complete(
      Result.success(_workspaceSnapshotWithReaderSummary()),
    );

    await Future.wait([first, second]);

    expect(catalog.workspaceSummaryLoadCount, 1);
    expect(catalog.summaryListLoadCount, 0);
  });

  test('loads generated summary history only as fallback', () async {
    final catalog = DeferredSummaryReviewCatalog([
      generatedSummary(id: 's-legacy', title: 'Stored generated summary'),
    ]);
    final store = _storeFromCatalog(catalog);

    await store.load();

    expect(catalog.workspaceSummaryLoadCount, 1);
    expect(catalog.summaryListLoadCount, 1);
    final state =
        store.listState as ReadyViewState<PageResult<GeneratedSummary>>;
    expect(state.value.items.single.title, 'Stored generated summary');
  });
}

WorkspaceSummarySnapshot _workspaceSnapshotWithReaderSummary() {
  return WorkspaceSummarySnapshot(
    current: const SummaryMapper().readerSummaryToDomain(readerSummaryApiDto()),
    availablePeriodsAreComplete: true,
  );
}

SummariesReviewStore _storeFromCatalog(SummaryReviewCatalog catalog) {
  return SummariesReviewStore(
    dependencies: SummariesReviewStoreDependencies(
      listSummaries: ListSummariesUseCase(catalog),
      loadWorkspaceSummary: LoadWorkspaceSummaryUseCase(catalog),
      loadWorkspaceSummaryHistory: LoadWorkspaceSummaryHistoryUseCase(catalog),
      requestWorkspaceSummary: RequestWorkspaceSummaryUseCase(catalog),
      loadWorkspaceSummaryJobStatus: LoadWorkspaceSummaryJobStatusUseCase(
        catalog,
      ),
      loadSummaryDetail: LoadSummaryDetailUseCase(catalog),
      loadTopicRecommendations: LoadTopicRecommendationsUseCase(catalog),
      decideTopicRecommendation: DecideTopicRecommendationUseCase(catalog),
      loadPostRatings: LoadPostRatingsUseCase(catalog),
      regenerateSummary: RegenerateSummaryUseCase(catalog),
      submitFeedback: SubmitSummaryFeedbackUseCase(catalog),
      submitPostRating: SubmitPostRatingUseCase(catalog),
      submitReaderAction: SubmitReaderActionUseCase(catalog),
      openReaderSource: OpenReaderSourceUseCase(_FakeReaderSourceLauncher()),
    ),
    scope: summaryWorkspaceScope,
    userId: 'user-test',
    summaryRequestIdempotencyKeyFactory: (_, _) => 'summary-test-key',
    summaryPollInterval: Duration.zero,
  );
}

final class _FakeReaderSourceLauncher implements ReaderSourceLauncher {
  @override
  Future<Result<Unit>> open(Uri uri) async => const Result.success(Unit.value);
}
