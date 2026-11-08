import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/components/workspace_summary_period_toolbar.dart';

void main() {
  testWidgets('calendar selects November 8 without summary, preserving 7th marker', (
    tester,
  ) async {
    DateTime? selected;
    final savedDay7 = SummaryPeriodPreset.daily.resolveForCalendarDate(
      DateTime(2026, 11, 7),
      now: DateTime.utc(2026, 11, 9, 12),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: WorkspaceSummaryPeriodToolbar(
            selectedPeriod: savedDay7,
            selectedPreset: SummaryPeriodPreset.daily,
            availableSummaryPeriods: [savedDay7],
            allowUnpublishedDates: true,
            canNavigateToPreviousPeriod: true,
            canNavigateToNextPeriod: true,
            calendarNow: DateTime.utc(2026, 11, 9, 12),
            onPeriodChanged: (_) {},
            onPreviousPeriod: () {},
            onNextPeriod: () {},
            onCalendarDateSelected: (date) => selected = date,
          ),
        ),
      ),
    );

    await tester.tap(
      find.byKey(const ValueKey('workspace-summary-period-calendar')),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Blue dot: AI summary available. Other days show original posts.'),
      findsOneWidget,
    );
    await tester.tap(
      find.byKey(const ValueKey('workspace-summary-calendar-day-2026-11-08')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(selected, DateTime(2026, 11, 8));
    expect(tester.takeException(), isNull);
  });
}
