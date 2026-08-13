import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/weekly_summary_projection.dart';
import 'package:social_monitor_summaries/src/presentation/components/weekly_summary_projection_panel.dart';

import '../../support/weekly_summary_projection_test_data.dart';

void main() {
  testWidgets('withholds the artifact for a partial projection', (tester) async {
    await _pumpProjection(
      tester,
      partialWeeklySummaryProjection(
        activeWeeklyCertifiedArtifactPresent: true,
        evidenceLimitations: [weeklySummaryHistoricalLimitation()],
      ),
    );

    expect(find.byKey(const ValueKey('weekly-summary-blocked')), findsOneWidget);
    expect(find.text('Daily evidence is incomplete'), findsOneWidget);
    expect(find.text('Historical evidence limitation'), findsOneWidget);
    expect(find.textContaining('historical_unavailable'), findsOneWidget);
    expect(find.byKey(const ValueKey('weekly-summary-artifact')), findsNothing);
  });

  testWidgets('explains an artifact-missing partial projection accurately', (
    tester,
  ) async {
    await _pumpProjection(
      tester,
      partialWeeklySummaryProjection(hasCompleteEvidence: true),
    );

    expect(find.text('Certified weekly artifact is unavailable'), findsOneWidget);
    expect(
      find.textContaining('All daily evidence is certified'),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('weekly-summary-artifact')), findsNothing);
  });

  testWidgets('renders certified artifact provenance and safe citations responsively', (
    tester,
  ) async {
    await _pumpProjection(
      tester,
      completeWeeklySummaryProjection(),
      size: const Size(1280, 900),
    );

    expect(find.byKey(const ValueKey('weekly-summary-artifact')), findsOneWidget);
    expect(find.text('Certified provenance'), findsOneWidget);
    expect(find.text('Artifact SHA-256'), findsOneWidget);
    expect(find.textContaining('citation-1'), findsWidgets);
    expect(
      find.text('Canonical URL: example.test/evidence-1'),
      findsOneWidget,
    );
    expect(find.textContaining('fixture=1'), findsNothing);
    expect(find.textContaining('#evidence'), findsNothing);
  });

  testWidgets('discloses a historical limitation beside a complete artifact', (
    tester,
  ) async {
    await _pumpProjection(
      tester,
      completeWeeklySummaryProjection(
        evidenceLimitations: [weeklySummaryHistoricalLimitation()],
      ),
    );

    expect(
      find.byKey(const ValueKey('weekly-summary-evidence-limitations')),
      findsOneWidget,
    );
    expect(find.text('Historical evidence limitation'), findsOneWidget);
    expect(find.byKey(const ValueKey('weekly-summary-artifact')), findsOneWidget);
  });

  testWidgets('withholds an unavailable projection from the artifact panel', (
    tester,
  ) async {
    await _pumpProjection(tester, unavailableWeeklySummaryProjection());

    expect(find.byKey(const ValueKey('weekly-summary-blocked')), findsOneWidget);
    expect(find.text('No certified weekly summary is available'), findsOneWidget);
    expect(find.byKey(const ValueKey('weekly-summary-artifact')), findsNothing);
  });
}

Future<void> _pumpProjection(
  WidgetTester tester,
  WeeklySummaryProjection projection, {
  Size size = const Size(390, 844),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final theme = AppTheme.light();
  await tester.pumpWidget(
    AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: MediaQuery(
          data: MediaQueryData(size: size),
          child: Scaffold(
            body: SingleChildScrollView(
              child: WeeklySummaryProjectionPanel(
                projection: projection,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}
