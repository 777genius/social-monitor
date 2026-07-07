import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/workspace_summary_period_toolbar.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('keeps every period segment visible on compact width', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: WorkspaceSummaryPeriodToolbar(
              selectedPeriod: SummaryPeriodPreset.daily.resolve(
                now: DateTime.utc(2026, 6, 27, 12),
              ),
              selectedPreset: SummaryPeriodPreset.daily,
              availableSummaryPeriods: const [],
              canNavigateToPreviousPeriod: false,
              canNavigateToNextPeriod: false,
              isCurrentPeriod: true,
              calendarNow: DateTime.utc(2026, 6, 27, 12),
              onPeriodChanged: (_) {},
              onPreviousPeriod: () {},
              onCurrentPeriod: () {},
              onNextPeriod: () {},
              onCalendarDateSelected: (_) {},
            ),
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    final monthRect = tester.getRect(find.text('Month'));
    expect(monthRect.right, lessThanOrEqualTo(390));
  });

  testWidgets('keeps period controls, stats and actions in one expanded row', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1024, 720);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        coverage: const ReaderSummaryCoverageApiDto(
          collectedFeedItemCount: 333,
          selectedFeedItemCount: 120,
          topReadCount: 10,
          citationCount: 120,
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: WorkspaceSummaryPeriodToolbar(
              selectedPeriod: SummaryPeriodPreset.daily.resolve(
                now: DateTime.utc(2026, 7, 5, 12),
              ),
              selectedPreset: SummaryPeriodPreset.daily,
              availableSummaryPeriods: const [],
              canNavigateToPreviousPeriod: false,
              canNavigateToNextPeriod: false,
              isCurrentPeriod: true,
              calendarNow: DateTime.utc(2026, 7, 5, 12),
              collectionStatsSummary: summary,
              onGenerate: () {},
              onExport: () {},
              onPeriodChanged: (_) {},
              onPreviousPeriod: () {},
              onCurrentPeriod: () {},
              onNextPeriod: () {},
              onCalendarDateSelected: (_) {},
            ),
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);

    final presetRect = tester.getRect(
      find.byKey(const ValueKey('workspace-summary-period-presets')),
    );
    expect(presetRect.width, lessThanOrEqualTo(421));

    final rowCenterY = tester
        .getCenter(
          find.byKey(const ValueKey('workspace-summary-period-calendar')),
        )
        .dy;
    for (final finder in [
      find.text('Daily'),
      find.byKey(const ValueKey('reader-summary-stat-Posts')),
      find.byKey(const ValueKey('reader-summary-stat-Sources')),
      find.byKey(const ValueKey('workspace-summary-export')),
    ]) {
      expect((tester.getCenter(finder).dy - rowCenterY).abs(), lessThan(28));
    }
  });

  testWidgets('opens material calendar and returns the selected period date', (
    tester,
  ) async {
    DateTime? selectedDate;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: WorkspaceSummaryPeriodToolbar(
            selectedPeriod: SummaryPeriodPreset.daily.resolve(
              now: DateTime.utc(2026, 6, 27, 12),
            ),
            selectedPreset: SummaryPeriodPreset.daily,
            availableSummaryPeriods: const [],
            canNavigateToPreviousPeriod: false,
            canNavigateToNextPeriod: false,
            isCurrentPeriod: true,
            calendarNow: DateTime.utc(2026, 6, 27, 12),
            onPeriodChanged: (_) {},
            onPreviousPeriod: () {},
            onCurrentPeriod: () {},
            onNextPeriod: () {},
            onCalendarDateSelected: (date) {
              selectedDate = date;
            },
          ),
        ),
      ),
    );

    await tester.tap(
      find.byKey(const ValueKey('workspace-summary-period-calendar')),
    );
    await tester.pumpAndSettle();

    expect(find.text('June 2026'), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey('workspace-summary-calendar-day-2026-06-15')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(selectedDate?.year, 2026);
    expect(selectedDate?.month, DateTime.june);
    expect(selectedDate?.day, 15);
  });

  testWidgets('keeps dates without a workspace summary unavailable', (
    tester,
  ) async {
    DateTime? selectedDate;
    final selectedPeriod = SummaryPeriodPreset.daily.resolve(
      now: DateTime.utc(2026, 6, 27, 12),
    );
    final availablePeriod = SummaryPeriodPreset.daily.resolveForCalendarDate(
      DateTime(2026, 6, 15),
      now: DateTime.utc(2026, 6, 27, 12),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: WorkspaceSummaryPeriodToolbar(
            selectedPeriod: selectedPeriod,
            selectedPreset: SummaryPeriodPreset.daily,
            availableSummaryPeriods: [availablePeriod],
            canNavigateToPreviousPeriod: false,
            canNavigateToNextPeriod: false,
            isCurrentPeriod: true,
            calendarNow: DateTime.utc(2026, 6, 27, 12),
            onPeriodChanged: (_) {},
            onPreviousPeriod: () {},
            onCurrentPeriod: () {},
            onNextPeriod: () {},
            onCalendarDateSelected: (date) {
              selectedDate = date;
            },
          ),
        ),
      ),
    );

    await tester.tap(
      find.byKey(const ValueKey('workspace-summary-period-calendar')),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(const ValueKey('workspace-summary-calendar-day-2026-06-16')),
      warnIfMissed: false,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(selectedDate, isNull);
  });

  testWidgets('does not mark every date when summary history is empty', (
    tester,
  ) async {
    final selectedPeriod = SummaryPeriodPreset.daily.resolve(
      now: DateTime.utc(2026, 6, 27, 12),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: WorkspaceSummaryPeriodToolbar(
            selectedPeriod: selectedPeriod,
            selectedPreset: SummaryPeriodPreset.daily,
            availableSummaryPeriods: const [],
            canNavigateToPreviousPeriod: false,
            canNavigateToNextPeriod: false,
            isCurrentPeriod: true,
            calendarNow: DateTime.utc(2026, 6, 27, 12),
            onPeriodChanged: (_) {},
            onPreviousPeriod: () {},
            onCurrentPeriod: () {},
            onNextPeriod: () {},
            onCalendarDateSelected: (_) {},
          ),
        ),
      ),
    );

    await tester.tap(
      find.byKey(const ValueKey('workspace-summary-period-calendar')),
    );
    await tester.pumpAndSettle();

    final decoration = _calendarDayDecoration(tester, '2026-06-15');
    final border = decoration.border! as Border;

    expect(border.top.width, 0);
    expect(border.top.color, Colors.transparent);
    expect(find.text('Summary history has not loaded yet'), findsOneWidget);
  });

  testWidgets('marks dates that have a workspace summary', (tester) async {
    final selectedPeriod = SummaryPeriodPreset.daily.resolveForCalendarDate(
      DateTime(2026, 6, 14),
      now: DateTime.utc(2026, 6, 27, 12),
    );
    final availablePeriod = SummaryPeriodPreset.daily.resolveForCalendarDate(
      DateTime(2026, 6, 15),
      now: DateTime.utc(2026, 6, 27, 12),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: WorkspaceSummaryPeriodToolbar(
            selectedPeriod: selectedPeriod,
            selectedPreset: SummaryPeriodPreset.daily,
            availableSummaryPeriods: [availablePeriod],
            canNavigateToPreviousPeriod: false,
            canNavigateToNextPeriod: false,
            isCurrentPeriod: true,
            calendarNow: DateTime.utc(2026, 6, 27, 12),
            onPeriodChanged: (_) {},
            onPreviousPeriod: () {},
            onCurrentPeriod: () {},
            onNextPeriod: () {},
            onCalendarDateSelected: (_) {},
          ),
        ),
      ),
    );

    await tester.tap(
      find.byKey(const ValueKey('workspace-summary-period-calendar')),
    );
    await tester.pumpAndSettle();

    final decoration = _calendarDayDecoration(tester, '2026-06-15');
    final border = decoration.border! as Border;

    expect(border.top.width, 1.5);
    expect(border.top.color, isNot(Colors.transparent));
    expect(
      find.text('Blue dot marks days with a saved summary'),
      findsOneWidget,
    );
  });
}

BoxDecoration _calendarDayDecoration(WidgetTester tester, String dateKey) {
  final day = tester.widget<Container>(
    find.descendant(
      of: find.byKey(ValueKey('workspace-summary-calendar-day-$dateKey')),
      matching: find.byType(Container),
    ),
  );
  return day.decoration! as BoxDecoration;
}
