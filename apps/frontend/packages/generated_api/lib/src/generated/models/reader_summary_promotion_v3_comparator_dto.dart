// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_promotion_engagement_dto.dart';
import 'reader_summary_promotion_popularity_dto.dart';
import 'reader_summary_promotion_v3_comparator_dto_block_block.dart';
import 'reader_summary_promotion_v3_comparator_dto_relevance_relevance.dart';
import 'reader_summary_promotion_v3_comparator_dto_usefulness_usefulness.dart';

part 'reader_summary_promotion_v3_comparator_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPromotionV3ComparatorDto {
  const ReaderSummaryPromotionV3ComparatorDto({
    required this.block,
    required this.candidateId,
    required this.metricMature,
    required this.newsPublisher,
    required this.providerFamily,
    required this.publishedAt,
    required this.relevance,
    required this.usefulness,
    this.engagement,
    this.popularity,
  });

  factory ReaderSummaryPromotionV3ComparatorDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryPromotionV3ComparatorDtoFromJson(json);

  /// Source registry class; unranked posts are only in the news block.
  final ReaderSummaryPromotionV3ComparatorDtoBlockBlock block;
  final String candidateId;

  /// Frozen metric of a ranked source; null means unknown. Always present in responses.
  final ReaderSummaryPromotionEngagementDto? engagement;

  /// engagement.observedAt - publishedAt >= 6 hours.
  final bool metricMature;

  /// Real publisher of a news.google.com item (title suffix), else null.
  final String? newsPublisher;

  /// Mid-rank inside providerFamily: (below + equal / 2) / cohortSize. Present only when metricMature and the family has at least 5 mature gate-passed posts (cohortSize >= 5), otherwise null. Always present in responses.
  final ReaderSummaryPromotionPopularityDto? popularity;

  /// Source registry family, e.g. x, reddit, hacker_news, github_radar, rss.
  final String providerFamily;
  final String publishedAt;

  /// Admission gate only; not an order key.
  final ReaderSummaryPromotionV3ComparatorDtoRelevanceRelevance relevance;
  final ReaderSummaryPromotionV3ComparatorDtoUsefulnessUsefulness usefulness;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryPromotionV3ComparatorDtoToJson(this);
}
