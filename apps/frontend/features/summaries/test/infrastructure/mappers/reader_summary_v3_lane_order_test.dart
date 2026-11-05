import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import '../../support/reader_promotion_comparator_fixture.dart';

void main() {
  test(
    'accepts the hybrid order: a strong useful post over a weak important one',
    () {
      final summary = _summary(
        top: [
          _item(1, popularity: const ReaderPromotionCountsFixture(10, 9, 1)),
          _item(
            2,
            usefulness: 'important',
            popularity: const ReaderPromotionCountsFixture(10, 0, 1),
            engagementValue: 0,
          ),
          _item(3, usefulness: 'important'),
        ],
      );

      expect(
        summary.content.promotionBoardAvailability,
        ReaderSummaryPromotionBoardAvailability.available,
      );
      expect(summary.content.topReads, hasLength(3));
    },
  );

  test('rejects a ranked lane whose order was forged', () {
    final summary = _summary(
      top: [
        _item(1, usefulness: 'important'),
        _item(2, popularity: const ReaderPromotionCountsFixture(10, 9, 1)),
      ],
    );

    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
    expect(summary.content.topReads, isEmpty);
  });

  test('breaks equal scores by recency, newest first', () {
    ReaderSummary board(List<int> hours) => _summary(
      top: [
        for (final (index, hour) in hours.indexed)
          _item(index + 1, publishedHour: hour),
      ],
    );

    expect(
      board([4, 2]).content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.available,
    );
    expect(
      board([2, 4]).content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
  });

  test('accepts 12 Top and 36 Show more posts from one network', () {
    final ranked = [
      for (var index = 1; index <= 48; index += 1)
        _item(
          index,
          popularity: ReaderPromotionCountsFixture(48, 48 - index, 1),
          engagementValue: 49 - index,
        ),
    ];
    final summary = _summary(
      top: ranked.sublist(0, 12),
      additional: [
        for (final (index, item) in ranked.sublist(12).indexed)
          _asAdditional(item, slot: index + 1),
      ],
    );

    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.available,
    );
    expect(summary.content.topReads, hasLength(12));
    expect(summary.content.selectedPosts, hasLength(36));
  });

  test('rejects Top over 12 and Show more behind an incomplete Top', () {
    final ranked = [
      for (var index = 1; index <= 13; index += 1)
        _item(
          index,
          popularity: ReaderPromotionCountsFixture(13, 13 - index, 1),
          engagementValue: 14 - index,
        ),
    ];

    expect(
      _summary(top: ranked).content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
    expect(
      _summary(
        top: ranked.sublist(0, 11),
        additional: [_asAdditional(ranked[11], slot: 1)],
      ).content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
  });
}

ReaderSummary _summary({
  required List<TopReadApiDto> top,
  List<TopReadApiDto> additional = const [],
}) {
  final cards = [...top, ...additional];
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
        topReads: top,
        selectedPosts: additional,
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
      storyClusterIds: [for (final item in cards) item.storyClusterId!],
      storyClusterAuthorities: [
        for (final item in cards)
          ReaderSummaryStoryClusterAuthorityApiDto(
            id: item.storyClusterId!,
            feedItemIds: ['feed-${item.storyClusterId}'],
            providerKeys: const ['reddit'],
          ),
      ],
      repeatedSignals: const [],
      citations: [
        for (final item in cards)
          SummaryCitationApiDto(
            id: item.citationIds.single,
            sourceLabel: 'Source',
            rawSnippet: 'Snippet',
            feedItemId: 'feed-${item.storyClusterId}',
            sourceItemId: 'source-${item.storyClusterId}',
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

TopReadApiDto _item(
  int slot, {
  String usefulness = 'useful',
  ReaderPromotionCountsFixture? popularity,
  num engagementValue = 10,
  int publishedHour = 2,
}) {
  final candidateId = 'candidate-${slot.toString().padLeft(2, '0')}';
  final publishedAt =
      '2026-10-19T${publishedHour.toString().padLeft(2, '0')}:00:00.000000Z';
  return TopReadApiDto(
    title: 'Story $slot',
    providerKey: 'reddit',
    reason: '',
    citationIds: ['citation-$slot'],
    cardKind: 'curated_top_read',
    storyClusterId: 'story:$slot',
    confirmedProviderKeys: const ['reddit'],
    publishedAt: DateTime.parse(publishedAt),
    promotionAttestation: _attestation(
      candidateId: candidateId,
      slot: slot,
      placement: 'top',
      publishedAt: publishedAt,
      comparator: rankedComparatorJson(
        candidateId: candidateId,
        publishedAt: publishedAt,
        usefulness: usefulness,
        popularity: popularity,
        engagementValue: engagementValue,
      ),
      storyId: 'story:$slot',
    ),
  );
}

TopReadApiDto _asAdditional(TopReadApiDto item, {required int slot}) {
  final attestation = item.promotionAttestation!;
  return TopReadApiDto(
    title: item.title,
    providerKey: item.providerKey,
    reason: item.reason,
    citationIds: item.citationIds,
    cardKind: 'additional_notable_story',
    storyClusterId: item.storyClusterId,
    confirmedProviderKeys: item.confirmedProviderKeys,
    publishedAt: item.publishedAt,
    promotionAttestation: _attestation(
      candidateId: attestation.candidateId,
      slot: slot,
      placement: 'additional',
      publishedAt: attestation.exactPublishedAt!,
      comparator: attestation.comparator!,
      storyId: attestation.storyId!,
    ),
  );
}

ReaderPostPromotionAttestationApiDto _attestation({
  required String candidateId,
  required int slot,
  required String placement,
  required String publishedAt,
  required Map<String, Object?> comparator,
  required String storyId,
}) => ReaderPostPromotionAttestationApiDto(
  schemaVersion: 'reader_post_promotion_attestation.v3',
  policyVersion: 'reader_promotion.2026-11-01',
  candidateId: candidateId,
  canonicalIdentity: 'https://example.com/$candidateId',
  placement: placement,
  slot: slot,
  decision: 'promote_$placement',
  citationIds: ['citation-${storyId.split(':').last}'],
  providerKey: 'reddit',
  storyId: storyId,
  exactPublishedAt: publishedAt,
  assessment: const {'schemaVersion': 'reader_value.v1'},
  comparator: comparator,
  presentation: const {'schemaVersion': 'reader_post_presentation.v3'},
);
