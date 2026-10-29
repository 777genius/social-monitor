import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

import 'reader_promotion_comparator_fixture.dart';
import 'summaries_test_fixtures.dart';

/// V3 promotion board in API DTO form: Reddit stories [top] and RSS stories
/// [news], listed in [authorityOrder] (Top, then news, by default).
///
/// Attestations bypass the transport verifier here; the mapper and the board
/// policy still check lanes, order, uniqueness and authority.
ReaderSummaryApiDto promotionBoardSummaryApiDto({
  required List<int> top,
  required List<int> news,
  List<int>? authorityOrder,
  String? freshnessReason,
}) {
  final authority = authorityOrder ?? [...top, ...news];
  String provider(int index) => news.contains(index) ? 'rss' : 'reddit';
  return readerSummaryApiDto(
    bindPromotionAttestations: false,
    topStories: const [],
    freshnessReason: freshnessReason,
    content: readerSummaryContentApiDto(
      topReads: [
        for (final (slot, index) in top.indexed)
          promotionBoardCardApiDto(index, placement: 'top', slot: slot + 1),
      ],
      selectedPosts: const [],
      newsWithoutRatingPosts: [
        for (final (slot, index) in news.indexed)
          promotionBoardCardApiDto(index, placement: 'news', slot: slot + 1),
      ],
      interestSections: const [],
    ),
    storyClusterIds: [for (final index in authority) 'story-$index'],
    storyClusterAuthorities: [
      for (final index in authority)
        ReaderSummaryStoryClusterAuthorityApiDto(
          id: 'story-$index',
          feedItemIds: ['feed-$index'],
          providerKeys: [provider(index)],
        ),
    ],
    citations: [
      for (final index in authority)
        summaryCitationApiDto(
          id: 'citation-$index',
          feedItemId: 'feed-$index',
          sourceItemId: 'source-$index',
          providerKey: provider(index),
          canonicalUrl: 'https://example.test/story-$index',
        ),
    ],
  );
}

/// One promoted card; news cards come from RSS and carry Signal 0, ranked
/// cards from Reddit with an unknown metric. Larger [index] means older.
TopReadApiDto promotionBoardCardApiDto(
  int index, {
  required String placement,
  required int slot,
}) {
  final news = placement == 'news';
  final provider = news ? 'rss' : 'reddit';
  final publishedAt = exactPromotionTimestamp(
    DateTime.utc(2026, 9, 20, 8).subtract(Duration(hours: index)),
  );
  final candidateId = 'feed-$index';
  return TopReadApiDto(
    storyClusterId: 'story-$index',
    cardKind: switch (placement) {
      'top' => 'curated_top_read',
      'additional' => 'additional_notable_story',
      _ => 'news_without_rating',
    },
    promotionAttestation: ReaderPostPromotionAttestationApiDto(
      schemaVersion: 'reader_post_promotion_attestation.v3',
      policyVersion: 'reader_promotion.2026-10-30',
      candidateId: candidateId,
      canonicalIdentity: 'https://example.test/story-$index',
      placement: placement,
      slot: slot,
      decision: 'promote_$placement',
      citationIds: ['citation-$index'],
      assessment: const {'schemaVersion': 'reader_value.v1'},
      comparator: news
          ? newsComparatorJson(
              candidateId: candidateId,
              publishedAt: publishedAt,
            )
          : rankedComparatorJson(
              candidateId: candidateId,
              publishedAt: publishedAt,
            ),
      presentation: const {'schemaVersion': 'reader_post_presentation.v3'},
      providerKey: provider,
      storyId: 'story-$index',
      exactPublishedAt: publishedAt,
    ),
    title: news ? 'Synthetic news $index' : 'Synthetic story $index',
    providerKey: provider,
    reason: 'Synthetic policy-authorized evidence.',
    confirmedProviderKeys: [provider],
    publishedAt: DateTime.parse(publishedAt),
    citationIds: ['citation-$index'],
    canonicalUrl: 'https://example.test/story-$index',
  );
}
