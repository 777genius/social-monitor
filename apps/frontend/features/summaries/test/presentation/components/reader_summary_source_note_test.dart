import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('does not add a synthetic source note above evidence', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              storyClusterId: 'story:openai-product-update',
              cardKind: 'curated_top_read',
              title: 'OpenAI product update',
              providerKey: 'x-twitter',
              reason: 'Official product announcement.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 2.1,
              canonicalUrl: 'https://x.com/acme/status/1',
              citationIds: ['source-note-citation'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(
            id: 'source-note-citation',
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

    expect(find.textContaining('Source note:'), findsNothing);
    expect(
      find.textContaining('enough engagement for discovery'),
      findsNothing,
    );
  });
}
