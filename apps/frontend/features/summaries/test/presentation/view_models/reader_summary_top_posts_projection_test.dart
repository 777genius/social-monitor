import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/summary_citation.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/top_posts_test_fixtures.dart';

void main() {
  test('projects Cursor HN and X evidence as one existing story card', () {
    final projection = readerSummaryTopPostsProjection(
      _summary(
        stories: [
          _story(
            id: 'story:cursor-agents',
            title: 'Cursor adds background agents',
            citations: const ['cursor-hn', 'cursor-x'],
            providers: const ['hacker-news', 'x-twitter'],
          ),
        ],
        evidence: [
          _evidence(
            title: 'Cursor adds background agents',
            provider: 'hacker-news',
            citation: 'cursor-hn',
            storyClusterId: 'story:cursor-agents',
            authorized: true,
            citationIds: const ['cursor-hn', 'cursor-x'],
            confirmedProviderKeys: const ['hacker-news', 'x-twitter'],
            metrics: const [ProviderMetric(label: 'Points', value: '24')],
          ),
        ],
      ),
    );

    expect(projection.additionalNotableStories, hasLength(1));
    final story = projection.additionalNotableStories.single;
    expect(story.title, 'Cursor adds background agents');
    expect(story.citationIds, ['cursor-hn', 'cursor-x']);
    expect(story.confirmedProviderKeys, ['hacker-news', 'x-twitter']);
  });

  test('projects official watermark RSS and metricless HN as one card', () {
    final projection = readerSummaryTopPostsProjection(
      _summary(
        stories: [
          _story(
            id: 'story:watermark',
            title: 'Watermark standard ships',
            citations: const ['watermark-official', 'watermark-hn'],
            providers: const ['rss', 'hacker-news'],
          ),
        ],
        evidence: [
          _evidence(
            title: 'Watermark standard ships',
            provider: 'rss',
            citation: 'watermark-official',
            storyClusterId: 'story:watermark',
            authorized: true,
            citationIds: const ['watermark-official', 'watermark-hn'],
          ),
        ],
      ),
    );

    expect(projection.additionalNotableStories, hasLength(1));
    expect(projection.additionalNotableStories.single.citationIds, [
      'watermark-official',
      'watermark-hn',
    ]);
  });

  test('one weak Reddit card makes the whole promotion board unavailable', () {
    final projection = readerSummaryTopPostsProjection(
      _summary(
        stories: [
          _story(
            id: 'story:cursor',
            title: 'Cursor background agents',
            citations: const ['cursor-hn'],
            providers: const ['hacker-news'],
          ),
          _story(
            id: 'story:reddit-question',
            title: 'Which editor should I use?',
            citations: const ['reddit-question'],
            providers: const ['reddit'],
          ),
        ],
        evidence: [
          _evidence(
            title: 'Cursor background agents',
            provider: 'hacker-news',
            citation: 'cursor-hn',
            storyClusterId: 'story:cursor',
            authorized: true,
            metrics: const [ProviderMetric(label: 'Points', value: '28')],
          ),
          _evidence(
            title: 'Which editor should I use for agents?',
            provider: 'reddit',
            citation: 'reddit-question',
            metrics: const [
              ProviderMetric(label: 'Score', value: '4'),
              ProviderMetric(label: 'Comments', value: '2'),
            ],
          ),
        ],
      ),
    );

    expect(projection.items, isEmpty);
  });

  test('allows an empty additional notable story board without backfill', () {
    final projection = readerSummaryTopPostsProjection(
      _summary(
        stories: [
          _story(
            id: 'story:weak',
            title: 'Weak discussion',
            citations: const ['weak-reddit'],
            providers: const ['reddit'],
          ),
        ],
        evidence: [
          _evidence(
            title: 'Weak discussion post',
            provider: 'reddit',
            citation: 'weak-reddit',
          ),
        ],
      ),
    );

    expect(projection.additionalNotableStories, isEmpty);
  });

  test('fails closed for a legacy selected post without card authority', () {
    final projection = readerSummaryTopPostsProjection(
      topPostsSummaryFixture(
        topReads: const [],
        selectedPosts: [
          topPostFixture(
            title: 'Legacy high-metric Reddit post',
            providerMetrics: const [
              ProviderMetric(label: 'Score', value: '5000'),
            ],
          ),
        ],
      ),
    );

    expect(projection.additionalNotableStories, isEmpty);
  });

  test(
    'rejects duplicate empty legacy GitHub identities before row keying',
    () {
      final duplicate = topPostFixture(
        title: '',
        cardKind: ReaderSummaryCardKind.supplementalTrend,
        providerKey: 'github-trending-page',
      );
      final projection = readerSummaryTopPostsProjection(
        topPostsSummaryFixture(
          topReads: const [],
          selectedPosts: [duplicate, duplicate],
        ),
      );

      expect(
        readerSummaryTopPostIdentity(duplicate),
        'fallback:github-trending-page:',
      );
      expect(projection.items, isEmpty);
    },
  );

  test('does not combine metrics from different providers to qualify', () {
    final projection = readerSummaryTopPostsProjection(
      _summary(
        stories: [
          _story(
            id: 'story:mixed-weak',
            title: 'Mixed weak reactions',
            citations: const ['weak-x', 'weak-reddit'],
            providers: const ['x-twitter', 'reddit'],
          ),
        ],
        evidence: [
          _evidence(
            title: 'X reaction',
            provider: 'x-twitter',
            citation: 'weak-x',
            metrics: const [ProviderMetric(label: 'Likes', value: '24')],
          ),
          _evidence(
            title: 'Reddit reaction',
            provider: 'reddit',
            citation: 'weak-reddit',
            metrics: const [ProviderMetric(label: 'Score', value: '19')],
          ),
        ],
      ),
    );

    expect(projection.additionalNotableStories, isEmpty);
  });

  test('keeps backend lane membership without local cross-lane dedupe', () {
    final curated = topPostFixture(
      title: 'Curated story',
      storyClusterId: 'story:curated',
      cardKind: ReaderSummaryCardKind.curatedTopRead,
      providerKey: 'hacker-news',
      citationIds: const ['curated-hn'],
      providerMetrics: const [ProviderMetric(label: 'Points', value: '40')],
    );
    final additional = topPostFixture(
      title: 'Curated story',
      storyClusterId: 'story:curated',
      cardKind: ReaderSummaryCardKind.additionalNotableStory,
      providerKey: 'hacker-news',
      citationIds: const ['curated-hn'],
      providerMetrics: const [ProviderMetric(label: 'Points', value: '40')],
    );
    final projection = readerSummaryTopPostsProjection(
      topPostsSummaryFixture(
        topReads: [curated],
        selectedPosts: [additional],
        topStories: [
          _story(
            id: 'story:curated',
            title: 'Curated story',
            citations: const ['curated-hn'],
            providers: const ['hacker-news'],
          ),
        ],
        citations: [_citation('curated-hn', 'hacker-news')],
      ),
    );

    expect(projection.additionalNotableStories, [additional]);
  });
}

ReaderSummary _summary({
  required List<SummaryStory> stories,
  required List<TopRead> evidence,
}) => topPostsSummaryFixture(
  topReads: const [],
  selectedPosts: evidence,
  topStories: stories,
  citations: [
    for (final item in evidence)
      for (final citationId in item.citationIds)
        _citation(citationId, item.providerKey),
  ],
);

SummaryStory _story({
  required String id,
  required String title,
  required List<String> citations,
  required List<String> providers,
}) => SummaryStory(
  storyClusterId: id,
  title: title,
  summary: '$title is notable across the cited sources.',
  topicCount: 1,
  providerCount: providers.length,
  interestIds: const ['developer-tools'],
  providerKeys: providers,
  citationIds: citations,
);

TopRead _evidence({
  required String title,
  required String provider,
  required String citation,
  String? storyClusterId,
  bool authorized = false,
  List<String>? citationIds,
  List<String>? confirmedProviderKeys,
  List<ProviderMetric> metrics = const [],
}) => topPostFixture(
  title: title,
  storyClusterId: storyClusterId,
  cardKind: authorized
      ? ReaderSummaryCardKind.additionalNotableStory
      : ReaderSummaryCardKind.unsupported,
  providerKey: provider,
  canonicalUrl: 'https://$provider.example/$citation',
  citationIds: citationIds ?? [citation],
  confirmedProviderKeys: confirmedProviderKeys,
  providerMetrics: metrics,
);

SummaryCitation _citation(String id, String provider) => SummaryCitation(
  id: id,
  sourceLabel: '$provider source',
  safeSnippet: 'Synthetic citation detail.',
  feedItemId: 'feed-$id',
  sourceItemId: 'source-$id',
  providerKey: provider,
  canonicalUrl: 'https://$provider.example/$id',
);
