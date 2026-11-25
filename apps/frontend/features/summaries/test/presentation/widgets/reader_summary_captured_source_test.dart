import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_captured_source.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_captured_source.dart';

void main() {
  for (final width in [360.0, 1200.0]) {
    testWidgets('full selectable source at width $width and large text', (tester) async {
      tester.view.physicalSize = Size(width, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final body = '${List.filled(100, 'Synthetic é 漢字 🚀 context.').join('\n')}\n'
          'Final qualification: simulation only. <b>literal text</b>';
      await tester.pumpWidget(AppHeadlessScope(
        theme: ThemeData(),
        appBuilder: (overlayBuilder) => MaterialApp(builder: overlayBuilder,
          home: Scaffold(body: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: SingleChildScrollView(child: ReaderSummaryCapturedSource(
            source: ReaderCapturedSource(title: 'Separate source title', body: body,
              captureAvailability: ReaderCaptureAvailability.available,
              reviewAvailability: ReaderSourceReviewAvailability.bodyPresent),
          )),
        )),
      )));
      expect(find.text(body), findsNothing);
      await tester.tap(find.text('Captured source'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(SelectableText, body), findsOneWidget);
      expect(find.widgetWithText(SelectableText, 'Separate source title'), findsOneWidget);
      expect(tester.widget<SelectableText>(find.widgetWithText(SelectableText, body)).maxLines, isNull);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Hide captured source'));
      await tester.pumpAndSettle();
      expect(find.text(body), findsNothing);
    });
  }
}
