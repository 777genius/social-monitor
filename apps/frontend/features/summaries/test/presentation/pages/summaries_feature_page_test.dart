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
import 'package:social_monitor_summaries/src/domain/entities/generated_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_job_snapshot.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/in_memory_summaries_api_client.dart';
import 'package:social_monitor_summaries/src/infrastructure/repositories/generated_summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/presentation/pages/summaries_feature_page.dart';
import 'package:social_monitor_summaries/src/presentation/stores/summaries_review_store.dart';
import 'package:social_monitor_summaries/src/presentation/workflows/summaries_review_store_dependencies.dart';

import '../../support/mixed_source_summaries_test_fixtures.dart';
import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('renders expanded summaries with source links', (tester) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceSummary: githubTrendingReaderSummaryApiDto());

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.text('Workspace summary'), findsNothing);
    expect(find.text('Executive summary'), findsNothing);
    expect(find.text('Collection window (UTC)'), findsNothing);
    expect(find.text('GitHub Trending daily summary'), findsNothing);
    expect(find.textContaining('GitHub daily radar'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('reader-summary-lede-citation-bc-1')),
      findsOneWidget,
    );
    expect(
      find.byKey(
        const ValueKey('reader-summary-provider-coverage-github-trending-page'),
        skipOffstage: false,
      ),
      findsNothing,
    );
    expect(
      find.byKey(
        const ValueKey('reader-summary-coverage-by-source'),
        skipOffstage: false,
      ),
      findsNothing,
    );
    expect(
      find.text('Top 10 repositories in GitHub Trending order'),
      findsOneWidget,
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('reader-summary-top-post-0')),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('calesthio/OpenMontage'), findsWidgets);
    expect(find.text('Stars'), findsWidgets);
    expect(find.text('18K'), findsWidgets);
    expect(find.text('Single source'), findsWidgets);
    expect(find.text('Matching 1 interest'), findsWidgets);
    expect(
      find.byKey(const ValueKey('workspace-summary-toolbar-generate')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('workspace-summary-export')),
      findsOneWidget,
    );
  });

  testWidgets('does not show source-list summary headlines as the lead', (
    tester,
  ) async {
    final store = _store(
      [githubTrendingSummaryApiDto()],
      workspaceSummary: readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          headline:
              'Key signals across X/Twitter, Reddit, Hacker News +2: Claude Code workflow tips are moving fast',
        ),
      ),
    );

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.textContaining('Key signal:'), findsNothing);
    expect(
      find.textContaining('Key signals across X/Twitter, Reddit'),
      findsNothing,
    );
    expect(find.textContaining('AI coding tools'), findsWidgets);
  });

  testWidgets('quality warnings stay off the brief surface', (tester) async {
    final store = _store(
      [githubTrendingSummaryApiDto()],
      workspaceSummary: readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          qualityState: const ReaderSummaryQualityStateApiDto(
            status: 'ready',
            flags: [],
            warnings: ['Top reads need confirmation before acting.'],
            isSingleSource: false,
          ),
        ),
      ),
    );

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.text('Needs confirmation'), findsNothing);
    expect(find.text('Confidence'), findsNothing);
    expect(
      find.byKey(const ValueKey('reader-summary-confidence-level')),
      findsNothing,
    );
  });

  testWidgets(
    'shows provider coverage rows before technical evidence details',
    (tester) async {
      final store = _store([
        githubTrendingSummaryApiDto(),
      ], workspaceSummary: mixedSourceReaderSummaryApiDto());

      await _pumpSizedFeature(
        tester,
        store: store,
        size: const Size(1280, 820),
      );
      await tester.pumpAndSettle();

      expect(
        find.byKey(
          const ValueKey('reader-summary-provider-coverage-reddit'),
          skipOffstage: false,
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(
          const ValueKey('reader-summary-source-filter-hacker-news'),
          skipOffstage: false,
        ),
        findsNothing,
      );
      expect(
        find.byKey(
          const ValueKey('reader-summary-provider-coverage-hacker-news'),
          skipOffstage: false,
        ),
        findsOneWidget,
      );
      expect(
        find.byKey(
          const ValueKey('reader-summary-provider-coverage-rss'),
          skipOffstage: false,
        ),
        findsOneWidget,
      );
      expect(find.text('180 collected', skipOffstage: false), findsOneWidget);
      expect(
        find.text(
          '28 selected (30%) · 1 top read · 2 citations',
          skipOffstage: false,
        ),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('Top posts'),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.text('Top posts'), findsOneWidget);
      expect(find.text('Reddit thread on agent reliability'), findsWidgets);
      expect(find.text('Upvotes'), findsWidgets);
      expect(find.text('1.2K'), findsWidgets);
      expect(find.text('Comments'), findsWidgets);
      expect(find.text('246'), findsWidgets);
      expect(find.text('HN discussion on model routing'), findsWidgets);
      expect(find.text('Points'), findsWidgets);
      expect(find.text('312'), findsWidgets);
    },
  );

  testWidgets('separates GitHub Trending repositories from top posts', (
    tester,
  ) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceSummary: mixedSourceReaderSummaryApiDto());
    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('reader-summary-top-posts-board-github')),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('Reddit thread on agent reliability'), findsOneWidget);
    expect(find.text('calesthio/OpenMontage'), findsNothing);
    await tester.tap(
      find.byKey(const ValueKey('reader-summary-top-posts-board-github')),
    );
    await tester.pumpAndSettle();

    expect(find.text('GitHub trends'), findsOneWidget);
    expect(
      find.text('Top 10 repositories in GitHub Trending order'),
      findsOneWidget,
    );
    expect(find.text('calesthio/OpenMontage'), findsOneWidget);
    expect(find.text('Reddit thread on agent reliability'), findsNothing);

    await tester.tap(
      find.byKey(const ValueKey('reader-summary-top-posts-board-posts')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Reddit thread on agent reliability'), findsOneWidget);
    expect(find.text('calesthio/OpenMontage'), findsNothing);
  });

  testWidgets('provider chips filter the evidence list below the summary', (
    tester,
  ) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceSummary: mixedSourceReaderSummaryApiDto());

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('reader-summary-top-posts-filters')),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(
      find.byKey(const ValueKey('reader-summary-top-posts-filters')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Reddit thread on agent reliability'), findsOneWidget);
    await tester.tap(
      find.byKey(const ValueKey('reader-summary-top-posts-filters')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.widgetWithText(CheckedPopupMenuItem<String>, 'Reddit'),
    );
    await tester.pumpAndSettle();

    expect(find.text('Reddit thread on agent reliability'), findsNothing);
    expect(find.text('HN discussion on model routing'), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey('reader-summary-top-posts-filters')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.widgetWithText(CheckedPopupMenuItem<String>, 'Reddit'),
    );
    await tester.pumpAndSettle();

    expect(find.text('Reddit thread on agent reliability'), findsOneWidget);
  });

  testWidgets('compact summaries open detail only after explicit selection', (
    tester,
  ) async {
    final store = _store([summaryApiDto()]);

    await _pumpSizedFeature(tester, store: store, size: const Size(390, 780));
    await tester.pumpAndSettle();

    expect(find.text('Citation safety'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('Weekly risk summary'),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Weekly risk summary'), findsOneWidget);

    await tester.tap(find.text('Weekly risk summary'));
    await tester.pumpAndSettle();

    expect(find.text('Citation safety'), findsOneWidget);
    expect(find.byTooltip('Close detail'), findsOneWidget);
  });

  testWidgets('long summaries list uses lazy repeated-row viewport', (
    tester,
  ) async {
    final store = _store([]);
    final items = List<GeneratedSummary>.generate(
      120,
      (index) => generatedSummary(id: 's-$index', title: 'Summary $index'),
    );
    store.listState = ReadyViewState<PageResult<GeneratedSummary>>(
      PageResult<GeneratedSummary>(items: items, request: const PageRequest()),
    );

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(1280, 820),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('Summary 0'), findsWidgets);
    expect(find.text('Summary 119'), findsNothing);

    final summariesListScrollable = find.descendant(
      of: find.byType(AppDataList<GeneratedSummary>),
      matching: find.byType(Scrollable),
    );
    expect(summariesListScrollable, findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Summary 119'),
      600,
      scrollable: summariesListScrollable,
    );

    expect(find.text('Summary 119'), findsOneWidget);
  });

  testWidgets('shows terminal summary job failure instead of hiding panel', (
    tester,
  ) async {
    final store = _store([summaryApiDto()]);
    store.summaryJobState = const ReadyViewState<ReaderSummaryJobSnapshot>(
      ReaderSummaryJobSnapshot(
        id: 'summary-job-failed',
        status: ReaderSummaryJobStatus.failed,
        failureReason: 'Provider unavailable',
      ),
    );

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(1280, 820),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('Summary generation failed'), findsOneWidget);
    expect(find.text('Provider unavailable'), findsOneWidget);
  });

  testWidgets('compact summary keeps actionable controls readable', (
    tester,
  ) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceSummary: githubTrendingReaderSummaryApiDto());
    await store.loadWorkspaceSummary();

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(390, 844),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('AI summary'), findsNothing);
    expect(find.text('Executive summary'), findsNothing);
    expect(find.textContaining('GitHub daily radar'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('workspace-summary-toolbar-generate')),
      findsOneWidget,
    );

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('reader-summary-top-post-0')),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('reader-summary-top-post-0')),
      findsOneWidget,
    );
  });

  testWidgets('workspace summary renders the top ten reader reads', (
    tester,
  ) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceSummary: repoRadarTopTenReaderSummaryApiDto());
    await store.loadWorkspaceSummary();

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(1280, 1100),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('AI summary'), findsNothing);
    expect(
      find.byKey(const ValueKey('reader-summary-top-post-0')),
      findsOneWidget,
    );

    final scrollable = find.byType(Scrollable).first;
    final lastPost = find.byKey(const ValueKey('reader-summary-top-post-10'));
    for (var i = 0; i < 40 && !tester.any(lastPost); i += 1) {
      await tester.drag(scrollable, const Offset(0, -320));
      await tester.pumpAndSettle();
    }
    expect(
      find.byKey(const ValueKey('reader-summary-top-post-10')),
      findsOneWidget,
    );
    expect(find.text('repo-radar/project-11'), findsWidgets);
  });

  testWidgets('stale summary keeps previous content while refreshing', (
    tester,
  ) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceSummary: githubTrendingReaderSummaryApiDto());
    await store.loadWorkspaceSummary();
    final ready =
        (store.workspaceSummaryState
                as ReadyViewState<WorkspaceSummarySnapshot>)
            .value;
    store.workspaceSummaryState = LoadingViewState<WorkspaceSummarySnapshot>(
      previousValue: ready,
    );

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(1280, 820),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('AI summary'), findsNothing);
    expect(find.text('Executive summary'), findsNothing);
    expect(find.textContaining('GitHub daily radar'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('workspace-summary-toolbar-generate')),
      findsOneWidget,
    );
  });

  testWidgets('compact failure and empty summary states stay visible', (
    tester,
  ) async {
    final failedStore = _store([summaryApiDto()]);
    failedStore.workspaceSummaryState =
        const FailureViewState<WorkspaceSummarySnapshot>(
          failure: UnexpectedFailure(
            message: 'Provider evidence unavailable',
            code: 'summaries.provider_failed',
          ),
        );

    await _pumpSizedFeature(
      tester,
      store: failedStore,
      size: const Size(390, 780),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('Summary unavailable'), findsOneWidget);
    expect(find.text('Provider evidence unavailable'), findsOneWidget);

    final emptyStore = _store([]);
    emptyStore.workspaceSummaryState =
        const EmptyViewState<WorkspaceSummarySnapshot>(
          reason: 'summaries.empty',
        );

    await _pumpSizedFeature(
      tester,
      store: emptyStore,
      size: const Size(390, 780),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('No workspace summary'), findsOneWidget);
    expect(
      find.text('Run a workspace summary after feed items are collected.'),
      findsOneWidget,
    );
  });
}

SummariesReviewStore _store(
  List<SummaryApiDto> items, {
  ReaderSummaryApiDto? workspaceSummary,
}) {
  final catalog = GeneratedSummaryReviewCatalog(
    apiClient: InMemorySummariesApiClient(
      items: items,
      workspaceSummary: workspaceSummary,
    ),
  );
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
      openReaderSource: const OpenReaderSourceUseCase(
        _FakeReaderSourceLauncher(),
      ),
    ),
    scope: summaryWorkspaceScope,
    userId: 'user-test',
    summaryPollInterval: Duration.zero,
  );
}

final class _FakeReaderSourceLauncher implements ReaderSourceLauncher {
  const _FakeReaderSourceLauncher();
  @override
  Future<Result<Unit>> open(Uri uri) async => const Result.success(Unit.value);
}

Future<void> _pumpSizedFeature(
  WidgetTester tester, {
  required SummariesReviewStore store,
  required Size size,
  bool autoload = true,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final theme = AppTheme.light();
  await tester.pumpWidget(
    AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: MediaQuery(
          data: MediaQueryData(size: size),
          child: Scaffold(
            body: SummariesFeaturePage(store: store, autoload: autoload),
          ),
        ),
      ),
    ),
  );
}
