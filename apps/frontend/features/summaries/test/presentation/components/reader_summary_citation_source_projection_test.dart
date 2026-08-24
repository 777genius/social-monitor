import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

import '../../support/summaries_test_fixtures.dart';

const _redditUrl = 'https://reddit.test/r/ai/comments/apple-openai';
const _hackerNewsUrl = 'https://news.ycombinator.test/item?id=42';
const _rssUrl = 'https://publisher.test/apple-openai-lawsuit';
const _representativeTitle = 'Apple sues OpenAI over alleged trade secrets';

void main() {
  testWidgets('deduplicates repeated citation identities in the source menu', (
    tester,
  ) async {
    final summary = _clusteredSummary(secondaryUrl: _redditUrl);

    await _pumpSummary(tester, summary);
    final citationChip = find.byKey(
      const ValueKey('reader-summary-lede-citation-bc-1'),
    );

    expect(
      find.descendant(of: citationChip, matching: find.text('2')),
      findsOneWidget,
    );

    await tester.tap(citationChip);
    await tester.pumpAndSettle();

    expect(
      find.byKey(
        const ValueKey('reader-summary-url-action-citation-source-bc-1'),
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(
        const ValueKey('reader-summary-url-action-citation-source-bc-2'),
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(
        const ValueKey('reader-summary-url-action-citation-source-bc-3'),
      ),
      findsNothing,
    );
    expect(find.byType(MenuItemButton), findsNWidgets(2));
  });

  testWidgets('renders clustered secondary citations as their actual sources', (
    tester,
  ) async {
    final summary = _clusteredSummary(secondaryUrl: _rssUrl);

    await _pumpSummary(tester, summary);
    final citationChip = find.byKey(
      const ValueKey('reader-summary-lede-citation-bc-1'),
    );

    expect(
      find.descendant(of: citationChip, matching: find.text('3')),
      findsOneWidget,
    );

    await tester.tap(citationChip);
    await tester.pumpAndSettle();

    final menuItems = find.byType(MenuItemButton);
    expect(menuItems, findsNWidgets(3));
    expect(
      find.descendant(of: menuItems, matching: find.text(_representativeTitle)),
      findsOneWidget,
    );
    expect(find.text('[2] Hacker News'), findsOneWidget);
    expect(find.text('[3] RSS article'), findsOneWidget);
  });
}

Future<void> _pumpSummary(WidgetTester tester, ReaderSummary summary) async {
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
}

ReaderSummary _clusteredSummary({required String secondaryUrl}) {
  const mapper = SummaryMapper();
  return mapper.readerSummaryToDomain(
    readerSummaryApiDto(
      content: const ReaderSummaryContentApiDto(
        headline: 'Cross-source legal signal',
        oneLineTakeaway: 'Multiple monitored sources discuss the same claim.',
        bullets: [],
        interestSections: [
          ReaderInterestSectionApiDto(
            title: 'AI legal risk',
            insight: 'Multiple monitored sources discuss the same claim.',
            items: [],
            citationIds: ['bc-1', 'bc-2', 'bc-3'],
          ),
        ],
        sourceMix: [
          SourceMixEntryApiDto(
            providerKey: 'reddit',
            itemCount: 1,
            citationCount: 2,
          ),
          SourceMixEntryApiDto(
            providerKey: 'hacker-news',
            itemCount: 1,
            citationCount: 1,
          ),
        ],
        topReads: [
          TopReadApiDto(
            storyClusterId: 'story:representative-legal-claim',
            cardKind: 'curated_top_read',
            title: _representativeTitle,
            providerKey: 'reddit',
            reason: 'The discussion adds context to the reported legal claim.',
            citationIds: ['bc-1', 'bc-3'],
            canonicalUrl: _redditUrl,
          ),
        ],
        trendDelta: ReaderTrendDeltaApiDto(
          newSignals: [],
          growingSignals: [],
          repeatedSignals: [],
          fadingSignals: [],
        ),
        openQuestions: [],
        risks: [],
        nextActions: [],
      ),
      citations: [
        summaryCitationApiDto(
          id: 'bc-1',
          sourceLabel: 'Reddit thread [1]',
          providerKey: 'reddit',
          canonicalUrl: _redditUrl,
        ),
        summaryCitationApiDto(
          id: 'bc-2',
          sourceLabel: 'Hacker News [2]',
          providerKey: 'hacker-news',
          canonicalUrl: _hackerNewsUrl,
        ),
        summaryCitationApiDto(
          id: 'bc-3',
          sourceLabel: 'RSS article [3]',
          providerKey: 'rss',
          canonicalUrl: secondaryUrl,
        ),
      ],
    ),
  );
}
