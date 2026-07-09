import 'dart:ui' show PointerDeviceKind;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_provider_logo.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('renders executive summary markdown without raw markers', (
    tester,
  ) async {
    const mapper = SummaryMapper();
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        executiveSummary:
            '**Fable 5** is back with stronger coding discussion across sources.',
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

    expect(find.textContaining('Fable 5'), findsWidgets);
    expect(find.textContaining('**Fable 5**'), findsNothing);
    expect(find.text('Key links'), findsNothing);
  });

  testWidgets('renders structured executive summary paragraphs and bullets', (
    tester,
  ) async {
    const mapper = SummaryMapper();
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        executiveSummary: [
          '**AI-agent workflows** dominated the day across social sources.',
          '',
          '- **Main signal:** Claude/Codex users are sharing concrete prompt-loop, MCP and debugging workflows.',
          '- **Why it matters:** Product teams can reuse these workflow patterns instead of chasing isolated prompts.',
          '- **Watch:** Treat single-source launch and benchmark claims as provisional.',
        ].join('\n'),
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

    expect(find.textContaining('AI-agent workflows'), findsWidgets);
    expect(find.textContaining('Main signal:'), findsOneWidget);
    expect(find.textContaining('Why it matters:'), findsOneWidget);
    expect(find.textContaining('Treat single-source launch'), findsOneWidget);
    expect(find.textContaining('**AI-agent workflows**'), findsNothing);
    expect(find.textContaining('**Main signal:**'), findsNothing);
  });

  testWidgets('renders grouped topic map panel in reader summary', (
    tester,
  ) async {
    const mapper = SummaryMapper();
    final summary = mapper.readerSummaryToDomain(readerSummaryApiDto());

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

    expect(find.byType(ReaderSummaryTopicMapPanel), findsOneWidget);
    expect(find.text('Topic map'), findsNothing);
    expect(find.text('AI tools'), findsAtLeastNWidgets(1));
    expect(find.byType(CustomPaint), findsAtLeastNWidgets(1));
  });

  testWidgets('hides topic labels that do not fit their bubble', (
    tester,
  ) async {
    const mapper = SummaryMapper();
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topicMap: const ReaderSummaryTopicMapApiDto(
            generatedBy: 'agent-runtime',
            confidence: ReaderSummaryTopicMapConfidenceApiDto(
              level: 'high',
              score: 0.9,
              rationale: 'Label fit policy test.',
            ),
            nodes: [
              ReaderSummaryTopicMapNodeApiDto(
                id: 'topic:major',
                label: 'Major signal',
                groupId: 'group:agent-tools',
                storyClusterIds: ['story:major'],
                popularityScore: 100,
                sizeWeight: 1,
                evidenceCount: 8,
                providerKeys: ['reddit', 'hacker-news'],
                interestIds: ['ai'],
                citationIds: ['bc-1'],
                keywords: ['major'],
                rationale: 'Primary topic.',
              ),
              ReaderSummaryTopicMapNodeApiDto(
                id: 'topic:tiny',
                label: 'Tiny unreadable label that should stay in tooltip',
                groupId: 'group:agent-tools',
                storyClusterIds: ['story:tiny'],
                popularityScore: 1,
                sizeWeight: 0.01,
                evidenceCount: 1,
                providerKeys: ['rss'],
                interestIds: ['ai'],
                citationIds: ['bc-1'],
                keywords: ['tiny'],
                rationale: 'Small topic.',
              ),
            ],
            groups: [
              ReaderSummaryTopicMapGroupApiDto(
                id: 'group:agent-tools',
                label: 'Agent tools',
                colorKey: 'blue',
                nodeIds: ['topic:major', 'topic:tiny'],
                confidence: ReaderSummaryTopicMapConfidenceApiDto(
                  level: 'high',
                  score: 0.9,
                  rationale: 'Same semantic group.',
                ),
              ),
            ],
            edges: [
              ReaderSummaryTopicMapEdgeApiDto(
                sourceNodeId: 'topic:major',
                targetNodeId: 'topic:tiny',
                weight: 0.8,
                reason: 'Same semantic topic group',
              ),
            ],
          ),
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: SizedBox(
            width: 320,
            child: ReaderSummaryTopicMapPanel(
              topicMap: summary.content.topicMap,
            ),
          ),
        ),
      ),
    );

    expect(find.text('Topic map'), findsNothing);
    expect(find.textContaining('Tiny unreadable'), findsNothing);
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is Tooltip &&
            (widget.message?.contains('Tiny unreadable label') ?? false) &&
            (widget.message?.contains('Score: 1') ?? false) &&
            (widget.message?.contains('Providers: rss') ?? false) &&
            (widget.message?.contains('Group: Agent tools') ?? false),
      ),
      findsOneWidget,
    );
  });

  testWidgets(
    'shows collected and selected summary counts without duplicates',
    (tester) async {
      const mapper = SummaryMapper();
      final summary = mapper.readerSummaryToDomain(
        readerSummaryApiDto(
          coverage: const ReaderSummaryCoverageApiDto(
            collectedFeedItemCount: 255,
            selectedFeedItemCount: 80,
            topReadCount: 9,
            citationCount: 80,
          ),
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
                  for (final citation in summary.citations)
                    citation.id: citation,
                },
                isRefreshing: false,
                onOpenUrl: (_) {},
              ),
            ),
          ),
        ),
      );

      expect(
        find.text('255 collected · 80 selected for summary · 9 top reads'),
        findsOneWidget,
      );
      expect(find.text('80 collected · 80 selected'), findsNothing);
    },
  );

  testWidgets('lists every related source for multi-citation text', (
    tester,
  ) async {
    const mapper = SummaryMapper();
    final openedUrls = <String>[];
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        content: const ReaderSummaryContentApiDto(
          headline: 'Cross-source signal',
          oneLineTakeaway: 'Three monitored sources confirm the same signal.',
          bullets: [],
          interestSections: [
            ReaderInterestSectionApiDto(
              title: 'Developer tooling',
              insight: 'Three monitored sources confirm the same signal.',
              items: [],
              citationIds: ['bc-1', 'bc-2', 'bc-3'],
            ),
          ],
          sourceMix: [
            SourceMixEntryApiDto(
              providerKey: 'reddit',
              itemCount: 1,
              citationCount: 1,
            ),
            SourceMixEntryApiDto(
              providerKey: 'hacker-news',
              itemCount: 1,
              citationCount: 1,
            ),
            SourceMixEntryApiDto(
              providerKey: 'rss',
              itemCount: 1,
              citationCount: 1,
            ),
          ],
          topReads: [
            TopReadApiDto(
              title: 'Reddit post about agent routing',
              providerKey: 'reddit',
              reason: 'Reddit discussion backs the claim.',
              citationIds: ['bc-1'],
              canonicalUrl: 'https://reddit.com/r/programming/comments/a',
            ),
            TopReadApiDto(
              title: 'HN thread about benchmark clarity',
              providerKey: 'hacker-news',
              reason: 'HN discussion backs the claim.',
              citationIds: ['bc-2'],
              canonicalUrl: 'https://news.ycombinator.com/item?id=2',
            ),
            TopReadApiDto(
              title: 'RSS article about the launch',
              providerKey: 'rss',
              reason: 'RSS article backs the claim.',
              citationIds: ['bc-3'],
              canonicalUrl: 'https://example.test/rss',
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
            rawSnippet: 'Reddit source context.',
            canonicalUrl: 'https://reddit.com/r/programming/comments/a',
          ),
          summaryCitationApiDto(
            id: 'bc-2',
            sourceLabel: 'Hacker News [2]',
            providerKey: 'hacker-news',
            rawSnippet: 'HN source context.',
            canonicalUrl: 'https://news.ycombinator.com/item?id=2',
          ),
          summaryCitationApiDto(
            id: 'bc-3',
            sourceLabel: 'RSS article [3]',
            providerKey: 'rss',
            rawSnippet: 'RSS source context.',
            canonicalUrl: 'https://example.test/rss',
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
              onOpenUrl: openedUrls.add,
            ),
          ),
        ),
      ),
    );

    await _hoverCitationChip(
      tester,
      const ValueKey('reader-summary-lede-citation-bc-1'),
    );

    expect(
      find.descendant(
        of: find.byKey(const ValueKey('reader-summary-lede-citation-bc-1')),
        matching: find.text('3'),
      ),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('reader-summary-citation-source-bc-1')),
      findsOneWidget,
    );
    final secondSource = find.byKey(
      const ValueKey('reader-summary-citation-source-bc-2'),
    );
    expect(secondSource, findsOneWidget);
    expect(
      find.byKey(const ValueKey('reader-summary-citation-source-bc-3')),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('reader-summary-citation-source-bc-1')),
        matching: find.text('Reddit post about agent routing'),
      ),
      findsAtLeastNWidgets(1),
    );
    expect(
      find.descendant(
        of: secondSource,
        matching: find.text('HN thread about benchmark clarity'),
      ),
      findsAtLeastNWidgets(1),
    );
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('reader-summary-citation-source-bc-3')),
        matching: find.text('RSS article about the launch'),
      ),
      findsAtLeastNWidgets(1),
    );
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('reader-summary-citation-source-bc-1')),
        matching: find.text('Reddit thread [1]'),
      ),
      findsNothing,
    );
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('reader-summary-citation-source-bc-1')),
        matching: find.byType(ReaderSummaryProviderLogo),
      ),
      findsOneWidget,
    );

    await tester.tap(secondSource);
    await tester.pumpAndSettle();

    expect(openedUrls, ['https://news.ycombinator.com/item?id=2']);
  });

  testWidgets('opens cited source menu from inline citation badges', (
    tester,
  ) async {
    const mapper = SummaryMapper();
    final openedUrls = <String>[];
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        citations: [
          summaryCitationApiDto(
            id: 'bc-1',
            sourceLabel: 'Reddit discussion [1]',
            rawSnippet: 'A Reddit post with ranked comments backs this claim.',
            canonicalUrl: 'https://reddit.com/r/LocalLLaMA/comments/example',
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
              onOpenUrl: openedUrls.add,
            ),
          ),
        ),
      ),
    );

    expect(
      find.byKey(const ValueKey('reader-summary-citation-source-bc-1')),
      findsNothing,
    );

    await _hoverCitationChip(
      tester,
      const ValueKey('reader-summary-lede-citation-bc-1'),
    );

    final sourceItem = find.byKey(
      const ValueKey('reader-summary-citation-source-bc-1'),
    );
    expect(sourceItem, findsOneWidget);
    expect(
      find.descendant(of: sourceItem, matching: find.text('AI coding tools')),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: sourceItem,
        matching: find.text('Reddit discussion [1]'),
      ),
      findsNothing,
    );
    expect(
      find.descendant(
        of: sourceItem,
        matching: find.text(
          'A Reddit post with ranked comments backs this claim.',
        ),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: sourceItem,
        matching: find.text('https://reddit.com/r/LocalLLaMA/comments/example'),
      ),
      findsNothing,
    );

    await tester.tap(sourceItem);
    await tester.pumpAndSettle();

    expect(openedUrls, ['https://reddit.com/r/LocalLLaMA/comments/example']);
  });

  testWidgets('renders real preview media in the brief top-read cards', (
    tester,
  ) async {
    const mapper = SummaryMapper();
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              title: 'RSS post with a video poster',
              providerKey: 'rss',
              reason: 'The source item includes a real media thumbnail.',
              matchedInterestIds: ['ai-tools'],
              matchedRules: ['interest:ai-tools'],
              signalScore: 0.91,
              providerMetrics: [
                ProviderMetricApiDto(label: 'Engagement', value: 'high'),
              ],
              whyImportant: ['The real provider metadata has media.'],
              whyNow: 'Current summary window includes RSS coverage.',
              canonicalUrl: 'https://example.test/rss-post',
              previewMedia: PreviewMediaApiDto(
                kind: 'video',
                url: 'https://cdn.example.test/rss-poster.jpg',
                sourceUrl: 'https://cdn.example.test/rss-video.mp4',
                altText: 'RSS video poster',
              ),
              citationIds: ['bc-1'],
            ),
          ],
        ),
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

    expect(find.byType(Image), findsOneWidget);
    expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
  });
}

Future<void> _hoverCitationChip(
  WidgetTester tester,
  ValueKey<String> key,
) async {
  final citationChip = find.byKey(key);
  expect(citationChip, findsOneWidget);

  final gesture = await tester.createGesture(kind: PointerDeviceKind.mouse);
  addTearDown(gesture.removePointer);
  await gesture.addPointer(location: Offset.zero);
  await tester.pump();
  await gesture.moveTo(tester.getCenter(citationChip));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}
