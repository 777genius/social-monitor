// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_promotion_v3_comparator_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPromotionV3ComparatorDto
_$ReaderSummaryPromotionV3ComparatorDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryPromotionV3ComparatorDto(
      candidateId: json['candidateId'] as String,
      publishedAt: json['publishedAt'] as String,
      relevance:
          ReaderSummaryPromotionV3ComparatorDtoRelevanceRelevance.fromJson(
            json['relevance'] as String,
          ),
      usefulness:
          ReaderSummaryPromotionV3ComparatorDtoUsefulnessUsefulness.fromJson(
            json['usefulness'] as String,
          ),
    );

Map<String, dynamic> _$ReaderSummaryPromotionV3ComparatorDtoToJson(
  ReaderSummaryPromotionV3ComparatorDto instance,
) => <String, dynamic>{
  'candidateId': instance.candidateId,
  'publishedAt': instance.publishedAt,
  'relevance': instance.relevance,
  'usefulness': instance.usefulness,
};
