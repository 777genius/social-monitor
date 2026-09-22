// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_promotion_v3_comparator_dto_relevance_relevance.dart';
import 'reader_summary_promotion_v3_comparator_dto_usefulness_usefulness.dart';

part 'reader_summary_promotion_v3_comparator_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPromotionV3ComparatorDto {
  const ReaderSummaryPromotionV3ComparatorDto({
    required this.candidateId,
    required this.publishedAt,
    required this.relevance,
    required this.usefulness,
  });

  factory ReaderSummaryPromotionV3ComparatorDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryPromotionV3ComparatorDtoFromJson(json);

  final String candidateId;
  final String publishedAt;
  final ReaderSummaryPromotionV3ComparatorDtoRelevanceRelevance relevance;
  final ReaderSummaryPromotionV3ComparatorDtoUsefulnessUsefulness usefulness;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryPromotionV3ComparatorDtoToJson(this);
}
