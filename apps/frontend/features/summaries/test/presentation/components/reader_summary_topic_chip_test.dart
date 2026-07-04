import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('topic chips render clean main topics and hide raw ids', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          mainTopics: const [
            'Coding agents',
            '4211ea2f-6b41-4a18-a454-b3089add381a',
          ],
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: SingleChildScrollView(
            child: ReaderSummaryExecutiveBrief(
              summary: summary,
              citationsById: {
                for (final citation in summary.citations) citation.id: citation,
              },
              onOpenUrl: (_) {},
            ),
          ),
        ),
      ),
    );

    expect(find.text('Coding agents'), findsOneWidget);
    expect(find.text('4211ea2f-6b41-4a18-a454-b3089add381a'), findsNothing);
  });
}
