import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import '../../support/reader_promotion_board_api_fixture.dart';
import '../../support/summaries_test_fixtures.dart';

void main() {
  const mapper = SummaryMapper();

  test('maps a complete V3 board with Top and News without rating', () {
    final summary = mapper.readerSummaryToDomain(
      promotionBoardSummaryApiDto(top: const [1, 2], news: const [3, 4]),
    );

    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.available,
    );
    expect(summary.content.topReads, hasLength(2));
    expect(summary.content.selectedPosts, isEmpty);
    expect(
      summary.content.newsWithoutRatingPosts.map((item) => item.cardKind),
      everyElement(ReaderSummaryCardKind.newsWithoutRating),
    );
    expect(
      summary.content.newsWithoutRatingPosts.map(
        (item) => item.promotionAttestation!.placement,
      ),
      everyElement(ReaderPostPromotionPlacement.news),
    );
  });

  test('maps a news-only board of a workspace without ranked sources', () {
    final summary = mapper.readerSummaryToDomain(
      promotionBoardSummaryApiDto(top: const [], news: const [1]),
    );

    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.available,
    );
    expect(summary.content.newsWithoutRatingPosts, hasLength(1));
  });

  for (final entry in <String, ({List<int> top, List<int> news})>{
    'its trailing Top card removed': (top: const [1], news: const [3]),
    'its trailing news card removed': (top: const [1], news: const [2]),
  }.entries) {
    test('rejects a V3 board with ${entry.key}', () {
      final summary = mapper.readerSummaryToDomain(
        promotionBoardSummaryApiDto(
          top: entry.value.top,
          news: entry.value.news,
          authorityOrder: const [1, 2, 3],
        ),
      );

      expect(
        summary.content.promotionBoardAvailability,
        ReaderSummaryPromotionBoardAvailability.unavailable,
      );
      expect(summary.content.topReads, isEmpty);
      expect(summary.content.newsWithoutRatingPosts, isEmpty);
    });
  }

  test(
    'reads an emptied day ranked under an old policy as rebuild required',
    () {
      final rebuild = mapper.readerSummaryToDomain(
        readerSummaryApiDto(
          bindPromotionAttestations: false,
          freshnessLabel: 'Stale',
          freshnessReason: 'ranking_policy_changed',
          content: readerSummaryContentApiDto(
            topReads: const [],
            selectedPosts: const [],
            interestSections: const [],
          ),
        ),
      );

      expect(
        rebuild.content.promotionBoardAvailability,
        ReaderSummaryPromotionBoardAvailability.rebuildRequired,
      );
      expect(rebuild.content.topReads, isEmpty);
      expect(rebuild.content.newsWithoutRatingPosts, isEmpty);
    },
  );

  test('accepts only an authority-empty no_signal promotion board', () {
    ReaderSummary emptyBoard({required bool noSignal}) =>
        mapper.readerSummaryToDomain(
          readerSummaryApiDto(
            bindPromotionAttestations: false,
            topStories: const [],
            storyClusterIds: const [],
            storyClusterAuthorities: const [],
            citations: const [],
            content: readerSummaryContentApiDto(
              qualityState: noSignal
                  ? const ReaderSummaryQualityStateApiDto(
                      status: 'no_signal',
                      flags: ['no_signal'],
                      warnings: [],
                      isSingleSource: false,
                    )
                  : null,
              topReads: const [],
              selectedPosts: const [],
              interestSections: const [],
            ),
          ),
        );

    expect(
      emptyBoard(noSignal: true).content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.available,
    );
    expect(
      emptyBoard(noSignal: false).content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
  });
}
