import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('defers the topic graph until after the first summary frame', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: ReaderSummaryDeferredTopicMapPanel(
            topicMap: summary.content.topicMap,
          ),
        ),
      ),
    );

    expect(
      find.byKey(const ValueKey('deferred-topic-map-placeholder')),
      findsOneWidget,
    );
    expect(find.byType(ReaderSummaryTopicMapPanel), findsNothing);

    await tester.pump(const Duration(milliseconds: 17));

    expect(
      find.byKey(const ValueKey('deferred-topic-map-placeholder')),
      findsNothing,
    );
    expect(find.byType(ReaderSummaryTopicMapPanel), findsOneWidget);
  });
}
