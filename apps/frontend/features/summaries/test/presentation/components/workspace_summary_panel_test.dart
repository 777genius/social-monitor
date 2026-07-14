import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_job_snapshot.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_topic_recommendation.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_action_target.dart';
import 'package:social_monitor_summaries/src/presentation/components/workspace_summary_panel.dart';

void main() {
  testWidgets('shows a weekly terminal no-signal period outcome', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      _TestApp(
        state: const ReadyViewState<WorkspaceSummarySnapshot>(
          WorkspaceSummarySnapshot(),
        ),
        job: ReaderSummaryJobSnapshot(
          id: 'summary-job-weekly-no-signal',
          status: ReaderSummaryJobStatus.noSignal,
          period: _weeklyPeriod,
        ),
        selectedPeriodPreset: SummaryPeriodPreset.weekly,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Weekly summary is not ready yet'), findsOneWidget);
    expect(find.text('Summary generation failed'), findsNothing);
  });

  testWidgets('shows a monthly terminal no-signal period outcome', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      _TestApp(
        state: const ReadyViewState<WorkspaceSummarySnapshot>(
          WorkspaceSummarySnapshot(),
        ),
        job: ReaderSummaryJobSnapshot(
          id: 'summary-job-monthly-no-signal',
          status: ReaderSummaryJobStatus.noSignal,
          period: _monthlyPeriod,
        ),
        selectedPeriodPreset: SummaryPeriodPreset.monthly,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Monthly summary is not ready yet'), findsOneWidget);
    expect(find.text('Summary generation failed'), findsNothing);
  });

  testWidgets('shows quality rejected summary job as quality outcome', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      _TestApp(
        jobState: const ReadyViewState<ReaderSummaryJobSnapshot>(
          ReaderSummaryJobSnapshot(
            id: 'summary-job-quality-rejected',
            status: ReaderSummaryJobStatus.qualityRejected,
            failureReason: 'Rejected by pre-publish quality gate',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Summary quality rejected'), findsOneWidget);
    expect(find.text('Rejected by pre-publish quality gate'), findsOneWidget);
  });

  testWidgets('names weekly and monthly summaries that are not ready yet', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 820);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const _TestApp(selectedPeriodPreset: SummaryPeriodPreset.weekly),
    );
    await tester.pumpAndSettle();

    expect(find.text('Weekly summary is not ready yet'), findsOneWidget);

    await tester.pumpWidget(
      const _TestApp(selectedPeriodPreset: SummaryPeriodPreset.monthly),
    );
    await tester.pumpAndSettle();

    expect(find.text('Monthly summary is not ready yet'), findsOneWidget);
  });
}

class _TestApp extends StatelessWidget {
  const _TestApp({
    required this.job,
    this.state = const InitialViewState<WorkspaceSummarySnapshot>(),
    this.selectedPeriodPreset = SummaryPeriodPreset.daily,
  });

  final ReaderSummaryJobSnapshot job;
  final AsyncViewState<WorkspaceSummarySnapshot> state;
  final SummaryPeriodPreset selectedPeriodPreset;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    final selectedPeriod = switch (selectedPeriodPreset) {
      SummaryPeriodPreset.weekly => _weeklyPeriod,
      SummaryPeriodPreset.monthly => _monthlyPeriod,
      SummaryPeriodPreset.daily ||
      SummaryPeriodPreset.twoWeeks ||
      SummaryPeriodPreset.threeWeeks => _period,
    };

    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: MediaQuery(
            data: const MediaQueryData(size: Size(1280, 820)),
            child: SingleChildScrollView(
              child: SizedBox(
                height: 820,
                child: WorkspaceSummaryPanel(
                  state: state,
                  jobState: ReadyViewState<ReaderSummaryJobSnapshot>(job),
                  readerActionState:
                      const InitialViewState<ReaderActionResult>(),
                  topicRecommendationState:
                      ReadyViewState<ReaderSummaryTopicRecommendationQueue>(
                        ReaderSummaryTopicRecommendationQueue(
                          windowStartedAt: _period.startedAt,
                          windowEndedAt: _period.endedAt,
                          items: const [],
                        ),
                      ),
                  activeReaderActionIdempotencyKey: null,
                  lastReaderActionIdempotencyKey: null,
                  selectedPeriod: selectedPeriod,
                  selectedPeriodPreset: selectedPeriodPreset,
                  availableSummaryPeriods: [selectedPeriod],
                  canNavigateToPreviousPeriod: false,
                  canNavigateToNextPeriod: false,
                  onPeriodChanged: (_) {},
                  onPreviousPeriod: () {},
                  onNextPeriod: () {},
                  onCalendarDateSelected: (_) {},
                  onRetry: () {},
                  onGenerate: () {},
                  intentForAction: (_, _) =>
                      const UserActionIntent(id: 'test-action'),
                  onAction: (_, _, [reason]) {},
                  topPostRatingFor: (_, _) => null,
                  onTopPostRating: (_, _, _, _) async => false,
                  onTopicRecommendationDecision: (_, _) async {},
                  onOpenUrl: (_, _) {},
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

final _period = SummaryPeriod(
  cadence: SummaryPeriodCadence.daily,
  startedAt: DateTime.utc(2026, 7, 4),
  endedAt: DateTime.utc(2026, 7, 5),
  timezone: 'UTC',
);

final _weeklyPeriod = SummaryPeriod(
  cadence: SummaryPeriodCadence.weekly,
  startedAt: DateTime.utc(2026, 6, 29),
  endedAt: DateTime.utc(2026, 7, 6),
  timezone: 'UTC',
);

final _monthlyPeriod = SummaryPeriod(
  cadence: SummaryPeriodCadence.monthly,
  startedAt: DateTime.utc(2026, 6),
  endedAt: DateTime.utc(2026, 7),
  timezone: 'UTC',
);
