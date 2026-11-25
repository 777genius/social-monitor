import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/components/workspace_summary_period_shell.dart';

void main() {
  testWidgets('shows an indeterminate loader directly below the header', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: WorkspaceSummaryPeriodShell(
            selectedPeriod: SummaryPeriodPreset.daily.resolve(
              now: DateTime.utc(2026, 9, 16, 12),
            ),
            selectedPreset: SummaryPeriodPreset.daily,
            availableSummaryPeriods: const [],
            canNavigateToPreviousPeriod: false,
            canNavigateToNextPeriod: false,
            onPeriodChanged: (_) {},
            onPreviousPeriod: () {},
            onNextPeriod: () {},
            onCalendarDateSelected: (_) {},
            isGenerating: false,
            isLoading: true,
            exportSummary: null,
            child: const Text('Summary content'),
          ),
        ),
      ),
    );

    final header = find.byKey(const ValueKey('workspace-summary-header-band'));
    final loader = find.byKey(
      const ValueKey('workspace-summary-period-loading'),
    );

    expect(loader, findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    expect(tester.getTopLeft(loader).dy, tester.getBottomLeft(header).dy);
  });

  testWidgets('hides the loader after loading completes', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: WorkspaceSummaryPeriodShell(
            selectedPeriod: SummaryPeriodPreset.daily.resolve(
              now: DateTime.utc(2026, 9, 16, 12),
            ),
            selectedPreset: SummaryPeriodPreset.daily,
            availableSummaryPeriods: const [],
            canNavigateToPreviousPeriod: false,
            canNavigateToNextPeriod: false,
            onPeriodChanged: (_) {},
            onPreviousPeriod: () {},
            onNextPeriod: () {},
            onCalendarDateSelected: (_) {},
            isGenerating: false,
            exportSummary: null,
            child: const Text('Summary content'),
          ),
        ),
      ),
    );

    expect(
      find.byKey(const ValueKey('workspace-summary-period-loading')),
      findsNothing,
    );
  });
}
