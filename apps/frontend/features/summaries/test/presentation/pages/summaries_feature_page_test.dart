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

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('renders expanded summaries with safe citations and feedback', (
    tester,
  ) async {
    final store = _store([
      repoRadarSummaryApiDto(),
    ], workspaceBriefing: repoRadarBriefingApiDto());

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.text('GitHub repo radar summary'), findsWidgets);
    expect(find.text('AI repo radar'), findsOneWidget);
    expect(find.text('Coverage'), findsOneWidget);
    expect(find.text('Top reads'), findsOneWidget);
    expect(find.text('By topic'), findsOneWidget);
    expect(find.text('Quality'), findsOneWidget);
    expect(find.text('Limited sources'), findsOneWidget);
    expect(find.text('Repo Radar: 3 items'), findsOneWidget);
    expect(find.text('3 clusters'), findsOneWidget);
    expect(find.textContaining('Only Repo Radar contributed'), findsOneWidget);
    expect(find.text('openai/codex'), findsWidgets);
    expect(find.text('Stars: 54,000'), findsOneWidget);
    expect(find.text('Trend: +360 / 48h'), findsOneWidget);
    expect(find.text('Why this matters'), findsWidgets);
    expect(find.text('Citations (1)'), findsWidgets);
    expect(find.textContaining('github.com/openai/codex'), findsWidgets);
    expect(find.text('Mark relevant'), findsOneWidget);
    expect(find.text('Repo Radar [1] openai/codex'), findsOneWidget);
    expect(find.text('Citation safety'), findsOneWidget);
    expect(
      find.text('54.0k stars, +210 in 24h and +360 in 48h.'),
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

  testWidgets('compact briefing keeps single-source actions readable', (
    tester,
  ) async {
    final store = _store([
      repoRadarSummaryApiDto(),
    ], workspaceBriefing: repoRadarBriefingApiDto());
    await store.loadWorkspaceBriefing();

    await _pumpSizedFeature(
      tester,
      store: store,
      size: const Size(390, 844),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('AI repo radar'), findsOneWidget);
    expect(find.text('Limited sources'), findsOneWidget);
    expect(find.textContaining('Only Repo Radar contributed'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('reader-brief-top-read-0-details')),
      findsOneWidget,
    );

    final watchRepository = find.byKey(
      const ValueKey('reader-brief-action-watch_repository-false'),
    );
    await tester.scrollUntilVisible(
      watchRepository,
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(watchRepository, findsOneWidget);
    expect(
      find.byKey(const ValueKey('reader-brief-action-read_source-true')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('reader-brief-action-mark_relevant-true')),
      findsOneWidget,
    );
  });

  testWidgets('stale briefing keeps previous content while refreshing', (
    tester,
  ) async {
    final store = _store([
      repoRadarSummaryApiDto(),
    ], workspaceBriefing: repoRadarBriefingApiDto());
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

    expect(find.text('AI repo radar'), findsOneWidget);
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
