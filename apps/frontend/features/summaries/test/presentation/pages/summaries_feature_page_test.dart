import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/use_cases/list_summaries_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_summary_detail_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_briefing_job_status_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_briefing_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/regenerate_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/request_workspace_briefing_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_summary_feedback_use_case.dart';
import 'package:social_monitor_summaries/src/domain/entities/briefing_job_snapshot.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/in_memory_summaries_api_client.dart';
import 'package:social_monitor_summaries/src/infrastructure/repositories/generated_summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/presentation/pages/summaries_feature_page.dart';
import 'package:social_monitor_summaries/src/presentation/stores/summaries_review_store.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('renders expanded summaries with safe citations and feedback', (
    tester,
  ) async {
    final store = _store([summaryApiDto()]);

    await _pumpSizedFeature(tester, store: store, size: const Size(1280, 820));
    await tester.pumpAndSettle();

    expect(find.text('Weekly risk briefing'), findsWidgets);
    expect(find.text('Citation safety'), findsOneWidget);
    expect(
      find.text('Users compared competitor pricing tiers.'),
      findsOneWidget,
    );
    expect(find.text('Helpful'), findsOneWidget);
  });

  testWidgets('compact summaries open detail only after explicit selection', (
    tester,
  ) async {
    final store = _store([summaryApiDto()]);

    await _pumpSizedFeature(tester, store: store, size: const Size(390, 780));
    await tester.pumpAndSettle();

    expect(find.text('Citation safety'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('Weekly risk briefing'),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Weekly risk briefing'), findsOneWidget);

    await tester.tap(find.text('Weekly risk briefing'));
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

    expect(find.text('Briefing generation failed'), findsOneWidget);
    expect(find.text('Provider unavailable'), findsOneWidget);
  });
}

SummariesReviewStore _store(List<SummaryApiDto> items) {
  final catalog = GeneratedSummaryReviewCatalog(
    apiClient: InMemorySummariesApiClient(items: items),
  );
  return SummariesReviewStore(
    listSummaries: ListSummariesUseCase(catalog),
    loadWorkspaceBriefing: LoadWorkspaceBriefingUseCase(catalog),
    requestWorkspaceBriefing: RequestWorkspaceBriefingUseCase(catalog),
    loadWorkspaceBriefingJobStatus: LoadWorkspaceBriefingJobStatusUseCase(
      catalog,
    ),
    loadSummaryDetail: LoadSummaryDetailUseCase(catalog),
    regenerateSummary: RegenerateSummaryUseCase(catalog),
    submitFeedback: SubmitSummaryFeedbackUseCase(catalog),
    scope: summaryWorkspaceScope,
    briefingPollInterval: Duration.zero,
  );
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
