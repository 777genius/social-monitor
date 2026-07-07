import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('source note links render without underline and with favicon', (
    tester,
  ) async {
    const linkTitle = 'X link source title for favicon test';
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              title: linkTitle,
              providerKey: 'x-twitter',
              reason: 'Source note link style regression.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 2.1,
              canonicalUrl: 'https://x.com/acme/status/1',
              citationIds: ['link-style-citation'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(
            id: 'link-style-citation',
            providerKey: 'x-twitter',
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: SingleChildScrollView(
            child: ReaderSummaryBriefSurface(
              summary: summary,
              citationsById: {
                for (final citation in summary.citations) citation.id: citation,
              },
              isRefreshing: false,
              onOpenUrl: (_) {},
            ),
          ),
        ),
      ),
    );

    expect(
      find.byKey(
        const ValueKey(
          'reader-summary-brief-link-favicon-https://x.com/favicon.ico',
        ),
      ),
      findsOneWidget,
    );
    expect(_hasLinkTextDecoration(tester, linkTitle), TextDecoration.none);
  });
}

TextDecoration? _hasLinkTextDecoration(WidgetTester tester, String text) {
  for (final richText in tester.widgetList<RichText>(find.byType(RichText))) {
    final decoration = _findDecoration(richText.text, text);
    if (decoration != null) {
      return decoration;
    }
  }
  return null;
}

TextDecoration? _findDecoration(InlineSpan span, String text) {
  if (span is TextSpan) {
    if ((span.text ?? '').contains(text)) {
      return span.style?.decoration;
    }
    final children = span.children ?? const <InlineSpan>[];
    for (final child in children) {
      final decoration = _findDecoration(child, text);
      if (decoration != null) {
        return decoration;
      }
    }
  }
  return null;
}
