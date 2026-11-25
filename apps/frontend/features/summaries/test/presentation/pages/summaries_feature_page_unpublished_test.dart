import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/reader_source_launcher.dart';
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
import 'package:social_monitor_summaries/src/domain/value_objects/reader_captured_source.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_posts_page.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';
import 'package:social_monitor_summaries/src/presentation/pages/summaries_feature_page.dart';
import 'package:social_monitor_summaries/src/presentation/stores/summaries_review_store.dart';
import 'package:social_monitor_summaries/src/presentation/workflows/summaries_review_store_dependencies.dart';

import '../../support/deferred_summary_review_catalog.dart';
import '../../support/reader_posts_browse_test_catalog.dart';
import '../../support/summaries_test_fixtures.dart';
import '../../support/top_posts_test_fixtures.dart';

void main() {
  testWidgets('workspace full page renders source-only day without summary', (
    tester,
  ) async {
    final summaryCatalog = DeferredSummaryReviewCatalog(const []);
    final store = _store(summaryCatalog);
    addTearDown(store.dispose);
    store.workspaceSummaryState =
        const ReadyViewState<WorkspaceSummarySnapshot>(
          WorkspaceSummarySnapshot(),
        );

    final browseCatalog = ControlledReaderPostCatalog();
    final browseStore = browseCatalog.createStore();
    addTearDown(browseStore.dispose);

    final theme = AppTheme.light();
    await tester.pumpWidget(
      AppHeadlessScope(
        theme: theme,
        appBuilder: (overlayBuilder) => MaterialApp(
          theme: theme,
          builder: overlayBuilder,
          home: Scaffold(
            body: SummariesFeaturePage(
              store: store,
              autoload: false,
              readerPostsBrowseStore: browseStore,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(browseCatalog.queries, hasLength(1));
    expect(
      browseCatalog.queries.single.order,
      TopPostsSortOrder.engagement,
    );
    browseCatalog.responses.single.complete(
      Result.success(
        ReaderPostsPage(
          items: [
            topPostFixture(
              title: 'Synthetic AI label',
              summary: 'Generated text should not appear',
              storyClusterId: 'source:workspace-fallback',
              providerKey: 'x-twitter',
              capturedSource: const ReaderCapturedSource(
                title: 'Synthetic AI label',
                body: 'Original post from the collected feed',
                captureAvailability: ReaderCaptureAvailability.available,
                reviewAvailability: ReaderSourceReviewAvailability.bodyPresent,
              ),
            ),
          ],
          total: 1,
          providerKeys: const ['x-twitter'],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No AI summary for this day'), findsOneWidget);
    expect(find.text('Top posts by likes'), findsOneWidget);
    expect(find.text('Original post from the collected feed'), findsOneWidget);
    expect(find.text('Synthetic AI label'), findsNothing);
    expect(find.text('Generated text should not appear'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

SummariesReviewStore _store(DeferredSummaryReviewCatalog catalog) =>
    SummariesReviewStore(
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
        openReaderSource: const OpenReaderSourceUseCase(_SourceLauncher()),
      ),
      scope: summaryWorkspaceScope,
      userId: 'user-test',
      allowUnpublishedDays: true,
    );

final class _SourceLauncher implements ReaderSourceLauncher {
  const _SourceLauncher();

  @override
  Future<Result<Unit>> open(Uri uri) async => const Result.success(Unit.value);
}
