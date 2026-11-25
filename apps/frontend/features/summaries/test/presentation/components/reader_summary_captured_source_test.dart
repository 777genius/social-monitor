import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_captured_source.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_captured_source.dart';

void main() {
  testWidgets('source-title capture does not look like a missing review', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        const ReaderSummaryCapturedSource(
          source: ReaderCapturedSource(
            title: 'Runtime regression discussion',
            body: 'Users are discussing a runtime regression.',
            captureAvailability: ReaderCaptureAvailability.available,
            reviewAvailability: ReaderSourceReviewAvailability.bodyPresent,
          ),
        ),
      ),
    );

    expect(find.text('Source review unavailable.'), findsNothing);
    expect(find.text('Captured source'), findsOneWidget);
  });

  testWidgets('captured body stays usable when review was never assessed', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        const ReaderSummaryCapturedSource(
          source: ReaderCapturedSource(
            title: 'Runtime regression discussion',
            body: 'Users are discussing a runtime regression.',
            captureAvailability: ReaderCaptureAvailability.available,
            reviewAvailability: ReaderSourceReviewAvailability.unavailable,
          ),
        ),
      ),
    );

    expect(find.text('Source review unavailable.'), findsNothing);
    expect(find.text('Captured source'), findsOneWidget);
  });
}

Widget _app(Widget child) {
  final theme = AppTheme.light();
  return AppHeadlessScope(
    theme: theme,
    appBuilder: (overlayBuilder) => MaterialApp(
      theme: theme,
      builder: overlayBuilder,
      home: Scaffold(body: child),
    ),
  );
}
