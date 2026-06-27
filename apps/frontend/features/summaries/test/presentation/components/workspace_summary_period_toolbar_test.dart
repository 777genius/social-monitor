import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/components/workspace_summary_period_toolbar.dart';

void main() {
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

    expect(find.text('Choose daily period'), findsOneWidget);

    await tester.tap(find.text('15').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    expect(selectedDate?.year, 2026);
    expect(selectedDate?.month, DateTime.june);
    expect(selectedDate?.day, 15);
  });
}
