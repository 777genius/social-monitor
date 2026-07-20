import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets(
    'shared surface renders ordinary Watch and cited GitHub appendix',
    (tester) async {
      final openedUrls = <String>[];
      final summary = const SummaryMapper().readerSummaryToDomain(
        readerSummaryApiDto(
          content: readerSummaryContentApiDto(
            narrativeSections: const [
              ReaderSummaryNarrativeSectionApiDto(
                id: 'ordinary-watch',
                kind: 'watch',
                title: 'Watch',
                text: 'Treat single-source launch claims as provisional.',
                citationIds: [],
              ),
              ReaderSummaryNarrativeSectionApiDto(
                id: 'github-trending',
                kind: 'watch',
                title: 'GitHub Trending',
                text:
                    '- malformed legacy entry without a repository metric.\n'
                    '- **example/valid-repository**: +1,234 stars today.',
                citationIds: ['c-unmatched', 'c-valid'],
              ),
            ],
          ),
          citations: [
            summaryCitationApiDto(
              id: 'c-unmatched',
              providerKey: 'github-trending-page',
              canonicalUrl: 'https://github.com/example/unmatched-repository',
            ),
            summaryCitationApiDto(
              id: 'c-valid',
              providerKey: 'github-trending-page',
              canonicalUrl: 'https://github.com/Example/valid-repository/',
            ),
          ],
        ),
      );

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: SingleChildScrollView(
              child: ReaderSummaryBriefSurface(
                summary: summary,
                citationsById: {
                  for (final citation in summary.citations)
                    citation.id: citation,
                },
                isRefreshing: false,
                onOpenUrl: openedUrls.add,
              ),
            ),
          ),
        ),
      );

      expect(
        find.byKey(const ValueKey('reader-summary-narrative-ordinary-watch')),
        findsOneWidget,
      );
      expect(
        find.textContaining(
          'Treat single-source launch claims as provisional.',
        ),
        findsOneWidget,
      );
      expect(find.text('GitHub Trending'), findsOneWidget);
      expect(find.text('Watch'), findsOneWidget);
      expect(find.textContaining('• Watch: •'), findsNothing);
      expect(
        find.byKey(
          const ValueKey(
            'reader-summary-github-watch-row-0-citation-c-unmatched',
          ),
        ),
        findsNothing,
      );
      final validCitation = find.byKey(
        const ValueKey('reader-summary-github-watch-row-0-citation-c-valid'),
      );
      expect(validCitation, findsOneWidget);

      await tester.tap(validCitation);
      await tester.pumpAndSettle();
      final validSource = find.byKey(
        const ValueKey('reader-summary-citation-source-c-valid'),
      );
      expect(validSource, findsOneWidget);
      await tester.tap(validSource);
      await tester.pumpAndSettle();

      expect(openedUrls, ['https://github.com/Example/valid-repository/']);
    },
  );
}
