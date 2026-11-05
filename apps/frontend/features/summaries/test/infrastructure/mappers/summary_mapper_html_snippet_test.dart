import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import '../../support/reader_promotion_comparator_fixture.dart';

void main() {
  test('strips RSS HTML markup from reader-facing card copy', () {
    final summary = _summary([
      _item(
        title:
            'Claude Code Review is out of preview (for Team &amp; Enterprise)',
        summary:
            '<a href="https://news.google.com/rss/articles/abc">OpenAI Buys Orchestra Bio</a>&nbsp;&nbsp;<font color="#6f6f6f">Seeking Alpha</font>',
        capturedSource: const {
          'title': 'Team &amp; Co',
          'body':
              '<p>Article URL: <a href="https://x.example/mcp">https://x.example/mcp</a></p>',
          'captureAvailability': 'available',
          'reviewAvailability': 'body_present',
        },
        displayHeadline: const {
          'kind': 'claim',
          'status': 'accepted',
          'text': 'Vessla brings AI agents (Team &amp; Enterprise)',
        },
      ),
    ]);

    final item = summary.content.topReads.single;
    expect(item.summary, 'OpenAI Buys Orchestra Bio Seeking Alpha');
    expect(item.summary, isNot(contains('<')));
    expect(item.summary, isNot(contains('&nbsp;')));
    expect(
      item.title,
      'Claude Code Review is out of preview (for Team & Enterprise)',
    );
    expect(item.title, isNot(contains('&amp;')));
    expect(
      item.displayHeadline?.text,
      'Vessla brings AI agents (Team & Enterprise)',
    );
    expect(item.capturedSource?.body, 'Article URL: https://x.example/mcp');
    expect(item.capturedSource?.title, 'Team & Co');
  });
}

ReaderSummary _summary(List<TopReadApiDto> topReads) {
  final storyClusterIds = [for (final item in topReads) item.storyClusterId!];
  return const SummaryMapper().readerSummaryToDomain(
    ReaderSummaryApiDto(
      id: 'summary-1',
      title: 'Workspace summary',
      executiveSummary: 'Executive summary',
      userId: 'user-1',
      content: ReaderSummaryContentApiDto(
        headline: 'Headline',
        oneLineTakeaway: 'Takeaway',
        bullets: const [],
        interestSections: const [],
        sourceMix: const [],
        topReads: topReads,
        trendDelta: const ReaderTrendDeltaApiDto(
          newSignals: [],
          growingSignals: [],
          repeatedSignals: [],
          fadingSignals: [],
        ),
        openQuestions: const [],
        risks: const [],
        nextActions: const [],
      ),
      topStories: const [],
      storyClusterIds: storyClusterIds,
      storyClusterAuthorities: [
        for (var index = 0; index < topReads.length; index += 1)
          ReaderSummaryStoryClusterAuthorityApiDto(
            id: storyClusterIds[index],
            feedItemIds: ['feed-$index'],
            providerKeys: const ['reddit'],
          ),
      ],
      repeatedSignals: const [],
      citations: [
        for (var index = 0; index < topReads.length; index += 1)
          SummaryCitationApiDto(
            id: 'citation-$index',
            sourceLabel: 'Source $index',
            rawSnippet: 'Snippet $index',
            feedItemId: 'feed-$index',
            sourceItemId: 'source-item-$index',
            providerKey: 'reddit',
          ),
      ],
      period: SummaryPeriodApiDto(
        cadence: 'daily',
        startedAt: DateTime.utc(2026, 10, 19),
        endedAt: DateTime.utc(2026, 10, 20),
        timezone: 'UTC',
      ),
      sourceWindow: SummaryWindowApiDto(
        label: 'Window',
        startedAt: DateTime.utc(2026, 10, 19),
        endedAt: DateTime.utc(2026, 10, 20),
        ingestionCutoff: DateTime.utc(2026, 10, 20),
      ),
      freshnessLabel: 'Today',
      isDegraded: false,
    ),
  );
}

TopReadApiDto _item({
  required String title,
  required String summary,
  required Object? capturedSource,
  required Object? displayHeadline,
}) {
  return TopReadApiDto(
    title: title,
    summary: summary,
    capturedSource: capturedSource,
    displayHeadline: displayHeadline,
    providerKey: 'reddit',
    reason: '',
    citationIds: const ['citation-0'],
    cardKind: 'curated_top_read',
    storyClusterId: 'story:one',
    signalScore: 5,
    confirmedProviderKeys: const ['reddit'],
    publishedAt: DateTime.parse('2026-10-19T02:00:00.000000Z'),
    promotionAttestation: ReaderPostPromotionAttestationApiDto(
      schemaVersion: 'reader_post_promotion_attestation.v3',
      policyVersion: 'reader_promotion.2026-11-01',
      candidateId: 'candidate-a',
      canonicalIdentity: 'https://example.com/candidate-a',
      placement: 'top',
      slot: 1,
      decision: 'promote_top',
      citationIds: const ['citation-0'],
      providerKey: 'reddit',
      storyId: 'story:one',
      exactPublishedAt: '2026-10-19T02:00:00.000000Z',
      assessment: const {
        'answers': {
          'usefulness': {'choice': 'useful'},
          'relevance': {'choice': 'central'},
        },
      },
      comparator: rankedComparatorJson(
        candidateId: 'candidate-a',
        publishedAt: '2026-10-19T02:00:00.000000Z',
      ),
      presentation: const {'schemaVersion': 'reader_post_presentation.v3'},
    ),
  );
}
