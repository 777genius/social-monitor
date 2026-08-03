import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/weekly_summary_week.dart';
import 'package:social_monitor_summaries/src/presentation/components/weekly_summary_week_controls.dart';

void main() {
  testWidgets('exposes accessible previous, next, and retry week controls', (
    tester,
  ) async {
    var previousPressed = 0;
    var nextPressed = 0;
    var retryPressed = 0;
    final theme = AppTheme.light();

    await tester.pumpWidget(
      AppHeadlessScope(
        theme: theme,
        appBuilder: (overlayBuilder) => MaterialApp(
          theme: theme,
          builder: overlayBuilder,
          home: Scaffold(
            body: WeeklySummaryWeekControls(
              week: WeeklySummaryWeek.fromUtcMonday(DateTime.utc(2026, 7, 20)),
              onPreviousWeek: () => previousPressed += 1,
              onNextWeek: () => nextPressed += 1,
              onRetry: () => retryPressed += 1,
            ),
          ),
        ),
      ),
    );

    expect(find.text('2026-07-20 to 2026-07-26 UTC'), findsOneWidget);
    await tester.tap(find.text('Previous week'));
    await tester.tap(find.text('Next week'));
    await tester.tap(find.text('Retry'));

    expect(previousPressed, 1);
    expect(nextPressed, 1);
    expect(retryPressed, 1);
  });
}
