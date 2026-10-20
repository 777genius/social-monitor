import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

void main() {
  test('accepts V3 lanes ordered by the engagement tie-break', () {
    final summary = _summary([
      _item(
        storyClusterId: 'story:one',
        candidateId: 'candidate-a',
        slot: 1,
        signalScore: 5,
        publishedAt: '2026-10-19T02:00:00.000000Z',
      ),
      _item(
        storyClusterId: 'story:two',
        candidateId: 'candidate-b',
        slot: 2,
        signalScore: 3,
        publishedAt: '2026-10-19T04:00:00.000000Z',
      ),
    ]);
    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.available,
    );
    expect(summary.content.topReads, hasLength(2));
  });

  test('rejects V3 lanes that violate the engagement tie-break', () {
    final summary = _summary([
      _item(
        storyClusterId: 'story:one',
        candidateId: 'candidate-a',
        slot: 1,
        signalScore: 3,
        publishedAt: '2026-10-19T02:00:00.000000Z',
      ),
      _item(
        storyClusterId: 'story:two',
        candidateId: 'candidate-b',
        slot: 2,
        signalScore: 5,
        publishedAt: '2026-10-19T04:00:00.000000Z',
      ),
    ]);
    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
    expect(summary.content.topReads, isEmpty);
  });

  test('breaks equal-score lanes by recency, newest first', () {
    final summary = _summary([
      _item(
        storyClusterId: 'story:one',
        candidateId: 'candidate-a',
        slot: 1,
        signalScore: 3,
        publishedAt: '2026-10-19T04:00:00.000000Z',
      ),
      _item(
        storyClusterId: 'story:two',
        candidateId: 'candidate-b',
        slot: 2,
        signalScore: 3,
        publishedAt: '2026-10-19T02:00:00.000000Z',
      ),
    ]);
    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.available,
    );
  });
}

ReaderSummary _summary(List<TopReadApiDto> topReads) {
  final storyClusterIds = [
    for (final item in topReads) item.storyClusterId!,
  ];
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
        startedAt: _periodStart,
        endedAt: _periodEnd,
        timezone: 'UTC',
      ),
      sourceWindow: SummaryWindowApiDto(
        label: 'Window',
        startedAt: _periodStart,
        endedAt: _periodEnd,
        ingestionCutoff: _periodEnd,
      ),
      freshnessLabel: 'Today',
      isDegraded: false,
    ),
  );
}

final _periodStart = DateTime.utc(2026, 10, 19);
final _periodEnd = DateTime.utc(2026, 10, 20);

TopReadApiDto _item({
  required String storyClusterId,
  required String candidateId,
  required int slot,
  required double signalScore,
  required String publishedAt,
}) {
  final index = slot - 1;
  return TopReadApiDto(
    title: 'Story $slot',
    providerKey: 'reddit',
    reason: '',
    citationIds: ['citation-$index'],
    cardKind: 'curated_top_read',
    storyClusterId: storyClusterId,
    signalScore: signalScore,
    confirmedProviderKeys: const ['reddit'],
    publishedAt: DateTime.parse(publishedAt),
    promotionAttestation: ReaderPostPromotionAttestationApiDto(
      schemaVersion: 'reader_post_promotion_attestation.v3',
      policyVersion: 'reader_post_promotion.v3',
      candidateId: candidateId,
      canonicalIdentity: 'https://example.com/$candidateId',
      placement: 'top',
      slot: slot,
      decision: 'promote_top',
      citationIds: ['citation-$index'],
      providerKey: 'reddit',
      storyId: storyClusterId,
      exactPublishedAt: publishedAt,
      assessment: const {
        'answers': {
          'usefulness': {'choice': 'useful'},
          'relevance': {'choice': 'central'},
        },
      },
      comparator: {
        'usefulness': 'useful',
        'relevance': 'central',
        'publishedAt': publishedAt,
        'candidateId': candidateId,
      },
      presentation: const {'schemaVersion': 'reader_post_presentation.v3'},
    ),
  );
}
