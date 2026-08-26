import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/presentation/components/workspace_summary_refresh_status.dart';

void main() {
  testWidgets('shows collection time and a live seconds countdown', (
    tester,
  ) async {
    var now = DateTime.parse('2026-08-15T05:12:10.000Z');
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 320,
            child: WorkspaceSummaryRefreshStatus(
              collectedAt: DateTime.parse('2026-08-15T05:10:00.000Z'),
              clock: () => now,
            ),
          ),
        ),
      ),
    );

    expect(
      find.textContaining('Collected through 2026-08-15 05:10 UTC'),
      findsOneWidget,
    );
    expect(find.textContaining('next update in 03:02:50'), findsOneWidget);
    expect(tester.takeException(), isNull);

    now = now.add(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.textContaining('next update in 03:02:49'), findsOneWidget);
  });

  testWidgets('shows an update in progress and polls a stale latest summary', (
    tester,
  ) async {
    var refreshes = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: WorkspaceSummaryRefreshStatus(
          collectedAt: DateTime.parse('2026-08-15T04:15:00.000Z'),
          clock: () => DateTime.parse('2026-08-15T08:20:00.000Z'),
          onRefreshDue: () => refreshes += 1,
        ),
      ),
    );
    await tester.pump();

    expect(find.textContaining('updating now'), findsOneWidget);
    expect(refreshes, 1);
  });

  testWidgets('does not report updating for a just-collected slot', (
    tester,
  ) async {
    var refreshes = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: WorkspaceSummaryRefreshStatus(
          collectedAt: DateTime.parse('2026-08-15T16:13:00.000Z'),
          clock: () => DateTime.parse('2026-08-15T18:05:00.000Z'),
          onRefreshDue: () => refreshes += 1,
        ),
      ),
    );
    await tester.pump();

    expect(find.textContaining('updating now'), findsNothing);
    expect(find.textContaining('next update in 02:10:00'), findsOneWidget);
    expect(refreshes, 0);
  });
}
