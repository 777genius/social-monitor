import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  const mapper = SummaryMapper();

  test('accepts a complete ordered V3 promotion board', () {
    final summary = mapper.readerSummaryToDomain(
      _summary(top: const [1, 2], additional: const [3, 4]),
    );

    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.available,
    );
    expect(summary.content.topReads, hasLength(2));
    expect(summary.content.selectedPosts, hasLength(2));
  });

  test('rejects a V3 board with its trailing Top card removed', () {
    final summary = mapper.readerSummaryToDomain(
      _summary(
        top: const [1],
        additional: const [3],
        authorityOrder: const [1, 2, 3],
      ),
    );

    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
    expect(summary.content.topReads, isEmpty);
    expect(summary.content.selectedPosts, isEmpty);
  });

  test('rejects a V3 board with its trailing Additional card removed', () {
    final summary = mapper.readerSummaryToDomain(
      _summary(
        top: const [1],
        additional: const [2],
        authorityOrder: const [1, 2, 3],
      ),
    );

    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
    expect(summary.content.topReads, isEmpty);
    expect(summary.content.selectedPosts, isEmpty);
  });

  test('accepts only an authority-empty no_signal promotion board', () {
    final noSignal = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        bindPromotionAttestations: false,
        topStories: const [],
        storyClusterIds: const [],
        storyClusterAuthorities: const [],
        citations: const [],
        content: readerSummaryContentApiDto(
          qualityState: const ReaderSummaryQualityStateApiDto(
            status: 'no_signal',
            flags: ['no_signal'],
            warnings: [],
            isSingleSource: false,
          ),
          topReads: const [],
          selectedPosts: const [],
          interestSections: const [],
        ),
      ),
    );
    final ordinaryEmpty = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        bindPromotionAttestations: false,
        topStories: const [],
        storyClusterIds: const [],
        storyClusterAuthorities: const [],
        citations: const [],
        content: readerSummaryContentApiDto(
          topReads: const [],
          selectedPosts: const [],
          interestSections: const [],
        ),
      ),
    );

    expect(
      noSignal.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.available,
    );
    expect(
      ordinaryEmpty.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
  });
}

ReaderSummaryApiDto _summary({
  required List<int> top,
  required List<int> additional,
  List<int>? authorityOrder,
}) {
  final authority = authorityOrder ?? [...top, ...additional];
  return readerSummaryApiDto(
    bindPromotionAttestations: false,
    topStories: const [],
    content: readerSummaryContentApiDto(
      topReads: [
        for (final entry in top.indexed)
          _item(entry.$2, placement: 'top', slot: entry.$1 + 1),
      ],
      selectedPosts: [
        for (final entry in additional.indexed)
          _item(entry.$2, placement: 'additional', slot: entry.$1 + 1),
      ],
      interestSections: const [],
    ),
    storyClusterIds: [for (final index in authority) 'story-$index'],
    storyClusterAuthorities: [
      for (final index in authority)
        ReaderSummaryStoryClusterAuthorityApiDto(
          id: 'story-$index',
          feedItemIds: ['feed-$index'],
          providerKeys: const ['rss'],
        ),
    ],
    citations: [
      for (final index in authority)
        summaryCitationApiDto(
          id: 'citation-$index',
          feedItemId: 'feed-$index',
          sourceItemId: 'source-$index',
          providerKey: 'rss',
          canonicalUrl: 'https://example.test/story-$index',
        ),
    ],
  );
}

TopReadApiDto _item(
  int index, {
  required String placement,
  required int slot,
}) => TopReadApiDto(
  storyClusterId: 'story-$index',
  cardKind: placement == 'top'
      ? 'curated_top_read'
      : 'additional_notable_story',
  promotionAttestation: ReaderPostPromotionAttestationApiDto(
    schemaVersion: 'reader_post_promotion_attestation.v3',
    policyVersion: 'reader_post_promotion.v3',
    candidateId: 'feed-$index',
    canonicalIdentity: 'https://example.test/story-$index',
    placement: placement,
    slot: slot,
    decision: placement == 'top' ? 'promote_top' : 'promote_additional',
    citationIds: ['citation-$index'],
    assessment: const {},
    comparator: {
      'usefulness': 'useful',
      'relevance': 'central',
    },
    presentation: const {},
    providerKey: 'rss',
    storyId: 'story-$index',
    exactPublishedAt: '2026-09-${20 - index}T08:00:00.000000Z',
  ),
  title: 'Synthetic story $index',
  providerKey: 'rss',
  reason: 'Synthetic policy-authorized evidence.',
  confirmedProviderKeys: const ['rss'],
  publishedAt: DateTime.utc(2026, 9, 20 - index, 8),
  citationIds: ['citation-$index'],
  canonicalUrl: 'https://example.test/story-$index',
);
