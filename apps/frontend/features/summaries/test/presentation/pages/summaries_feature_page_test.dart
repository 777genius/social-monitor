import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/briefing_reader_source_launcher.dart';
import 'package:social_monitor_summaries/src/application/use_cases/list_summaries_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_summary_detail_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_briefing_job_status_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_briefing_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/open_briefing_reader_source_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/regenerate_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/request_workspace_briefing_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_briefing_reader_action_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_summary_feedback_use_case.dart';
import 'package:social_monitor_summaries/src/domain/entities/briefing_job_snapshot.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_briefing.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/briefing_reader_action_target.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/in_memory_summaries_api_client.dart';
import 'package:social_monitor_summaries/src/infrastructure/repositories/generated_summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/presentation/pages/summaries_feature_page.dart';
import 'package:social_monitor_summaries/src/presentation/stores/summaries_review_store.dart';
import 'package:social_monitor_summaries/src/presentation/workflows/summaries_review_store_dependencies.dart';

import '../../support/mixed_source_summaries_test_fixtures.dart';
import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('renders expanded summaries with safe citations and feedback', (
    tester,
  ) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceBriefing: githubTrendingBriefingApiDto());

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.text('GitHub Trending daily summary'), findsWidgets);
    expect(find.text('GitHub daily radar'), findsOneWidget);
    expect(find.text('Top reads'), findsOneWidget);
    expect(find.text('Evidence and quality'), findsOneWidget);
    expect(
      find.text('Only GitHub Trending contributed cited evidence.'),
      findsOneWidget,
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('reader-brief-evidence-quality')),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('reader-brief-evidence-quality')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Coverage'), findsOneWidget);
    expect(find.text('By topic'), findsOneWidget);
    expect(find.text('Quality'), findsOneWidget);
    expect(find.text('Limited sources'), findsOneWidget);
    expect(find.text('GitHub Trending: 3 items'), findsOneWidget);
    expect(find.text('3 clusters'), findsOneWidget);
    expect(
      find.text(
        'Only GitHub Trending contributed cited evidence across 3 story clusters. Other connected providers did not confirm this yet.',
      ),
      findsOneWidget,
    );
    expect(find.text('calesthio/OpenMontage'), findsWidgets);
    expect(find.text('Signal 1.00'), findsWidgets);
    expect(find.text('Medium confidence 57%'), findsWidgets);
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('reader-brief-top-read-0-inline-details')),
      -500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('reader-brief-top-read-0-inline-details')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Ranking inputs'), findsOneWidget);
    expect(find.text('Source metrics'), findsWidgets);
    expect(find.text('Stars: 18,398'), findsOneWidget);
    expect(
      find.text('GitHub Trending today: #1, +3,703 stars today'),
      findsOneWidget,
    );
    expect(find.text('Why this matters'), findsWidgets);
    expect(find.text('Citations (1)'), findsWidgets);
    expect(
      find.textContaining('github.com/calesthio/OpenMontage'),
      findsWidgets,
    );
    expect(find.text('Mark relevant'), findsOneWidget);
    expect(
      find.text(
        'GitHub Trending - github.com/trending page [1] calesthio/OpenMontage',
      ),
      findsOneWidget,
    );
    expect(find.text('Citation safety'), findsOneWidget);
    expect(
      find.text('18.4k stars, #1 today and +3.7k stars today.'),
      findsWidgets,
    );
    expect(find.text('Helpful'), findsOneWidget);

    final markRelevantButton = find.byKey(
      const ValueKey('reader-brief-action-mark_relevant-true'),
    );
    await tester.ensureVisible(markRelevantButton);
    await tester.pumpAndSettle();
    await tester.tap(markRelevantButton);
    await tester.pumpAndSettle();

    expect(
      store.readerActionState,
      isA<ReadyViewState<BriefingReaderActionResult>>(),
    );
    expect(find.text('Marked relevant'), findsOneWidget);
    expect(find.text('Saved to preferences'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('reader-brief-action-mark_relevant-false')),
      findsOneWidget,
    );
  });

  testWidgets('shows mixed source coverage before technical evidence details', (
    tester,
  ) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceBriefing: mixedSourceBriefingApiDto());

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(
      find.text(
        'Sources: Reddit, GitHub Trending, Hacker News. 6 cited items.',
      ),
      findsOneWidget,
    );
    expect(find.text('Reddit 2'), findsOneWidget);
    expect(find.text('GitHub Trending 2'), findsOneWidget);
    expect(find.text('Hacker News 2'), findsOneWidget);
    expect(find.text('single-source'), findsNothing);
    expect(find.text('Top reads'), findsOneWidget);
    expect(find.text('Reddit thread on agent reliability'), findsOneWidget);
    expect(find.text('HN discussion on model routing'), findsOneWidget);
  });

  testWidgets('captures a reason before submitting not relevant feedback', (
    tester,
  ) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceBriefing: githubTrendingBriefingApiDto());

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    final notRelevantButton = find.byKey(
      const ValueKey('reader-brief-action-mark_not_relevant-true'),
    );
    await tester.ensureVisible(notRelevantButton);
    await tester.pumpAndSettle();
    await tester.tap(notRelevantButton);
    await tester.pumpAndSettle();

    expect(find.text('Not same story'), findsOneWidget);
    expect(find.text('Duplicate'), findsOneWidget);
    expect(find.text('Low quality source'), findsOneWidget);
    expect(find.text('Overrated provider'), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey('reader-brief-feedback-reason-duplicate')),
    );
    await tester.pumpAndSettle();

    expect(
      store.readerActionState,
      isA<ReadyViewState<BriefingReaderActionResult>>(),
    );
    expect(find.text('Marked not relevant'), findsOneWidget);
    expect(find.text('Saved to preferences'), findsOneWidget);
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

  testWidgets('shows terminal briefing job failure instead of hiding panel', (
    tester,
  ) async {
    final store = _store([summaryApiDto()]);
    store.briefingJobState = const ReadyViewState<BriefingJobSnapshot>(
      BriefingJobSnapshot(
        id: 'briefing-job-failed',
        status: BriefingJobStatus.failed,
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

  testWidgets('compact briefing keeps actionable controls readable', (
    tester,
  ) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceBriefing: githubTrendingBriefingApiDto());
    await store.loadWorkspaceBriefing();

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(390, 844),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('GitHub daily radar'), findsOneWidget);
    expect(find.text('Evidence and quality'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('reader-brief-top-read-0-details')),
      findsOneWidget,
    );

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('reader-brief-action-read_source-true')),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('reader-brief-action-watch_repository-false')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('reader-brief-action-read_source-true')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('reader-brief-action-mark_relevant-true')),
      findsOneWidget,
    );
  });

  testWidgets('workspace briefing renders the top ten reader reads', (
    tester,
  ) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceBriefing: repoRadarTopTenBriefingApiDto());
    await store.loadWorkspaceBriefing();

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(1280, 1100),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('Repo radar top ten'), findsOneWidget);
    expect(find.text('Showing 3 of 10 top reads'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('reader-brief-top-read-0')),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('reader-brief-top-read-9')), findsNothing);
    expect(find.text('repo-radar/project-10'), findsNothing);

    await tester.tap(
      find.byKey(const ValueKey('reader-brief-top-reads-toggle')),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('reader-brief-top-read-9')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('reader-brief-top-read-10')),
      findsNothing,
    );
    expect(find.text('repo-radar/project-10'), findsWidgets);
    expect(find.text('repo-radar/project-11'), findsNothing);
  });

  testWidgets('stale briefing keeps previous content while refreshing', (
    tester,
  ) async {
    final store = _store([
      githubTrendingSummaryApiDto(),
    ], workspaceBriefing: githubTrendingBriefingApiDto());
    await store.loadWorkspaceBriefing();
    final ready =
        (store.briefingState as ReadyViewState<WorkspaceBriefingSnapshot>)
            .value;
    store.briefingState = LoadingViewState<WorkspaceBriefingSnapshot>(
      previousValue: ready,
    );

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(1280, 820),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('GitHub daily radar'), findsOneWidget);
    expect(find.text('Refreshing'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('workspace-briefing-generate-false')),
      findsOneWidget,
    );
  });

  testWidgets('compact failure and empty briefing states stay visible', (
    tester,
  ) async {
    final failedStore = _store([summaryApiDto()]);
    failedStore.briefingState =
        const FailureViewState<WorkspaceBriefingSnapshot>(
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
    emptyStore.briefingState = const EmptyViewState<WorkspaceBriefingSnapshot>(
      reason: 'briefings.empty',
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
  BriefingApiDto? workspaceBriefing,
}) {
  final catalog = GeneratedSummaryReviewCatalog(
    apiClient: InMemorySummariesApiClient(
      items: items,
      workspaceBriefing: workspaceBriefing,
    ),
  );
  return SummariesReviewStore(
    dependencies: SummariesReviewStoreDependencies(
      listSummaries: ListSummariesUseCase(catalog),
      loadWorkspaceBriefing: LoadWorkspaceBriefingUseCase(catalog),
      requestWorkspaceBriefing: RequestWorkspaceBriefingUseCase(catalog),
      loadWorkspaceBriefingJobStatus: LoadWorkspaceBriefingJobStatusUseCase(
        catalog,
      ),
      loadSummaryDetail: LoadSummaryDetailUseCase(catalog),
      regenerateSummary: RegenerateSummaryUseCase(catalog),
      submitFeedback: SubmitSummaryFeedbackUseCase(catalog),
      submitBriefingReaderAction: SubmitBriefingReaderActionUseCase(catalog),
      openBriefingReaderSource: const OpenBriefingReaderSourceUseCase(
        _FakeBriefingReaderSourceLauncher(),
      ),
    ),
    scope: summaryWorkspaceScope,
    userId: 'user-test',
    briefingPollInterval: Duration.zero,
  );
}

final class _FakeBriefingReaderSourceLauncher
    implements BriefingReaderSourceLauncher {
  const _FakeBriefingReaderSourceLauncher();

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

  await tester.pumpWidget(
    _TestApp(store: store, size: size, autoload: autoload),
  );
}

class _TestApp extends StatelessWidget {
  const _TestApp({
    required this.store,
    required this.size,
    required this.autoload,
  });

  final SummariesReviewStore store;
  final Size size;
  final bool autoload;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
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
    );
  }
}
