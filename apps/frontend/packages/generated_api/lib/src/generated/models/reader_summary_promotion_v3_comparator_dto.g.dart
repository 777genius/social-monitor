// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_promotion_v3_comparator_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPromotionV3ComparatorDto
_$ReaderSummaryPromotionV3ComparatorDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryPromotionV3ComparatorDto(
      block: ReaderSummaryPromotionV3ComparatorDtoBlockBlock.fromJson(
        json['block'] as String,
      ),
      candidateId: json['candidateId'] as String,
      metricMature: json['metricMature'] as bool,
      newsPublisher: json['newsPublisher'] as String?,
      providerFamily: json['providerFamily'] as String,
      publishedAt: json['publishedAt'] as String,
      relevance:
          ReaderSummaryPromotionV3ComparatorDtoRelevanceRelevance.fromJson(
            json['relevance'] as String,
          ),
      usefulness:
          ReaderSummaryPromotionV3ComparatorDtoUsefulnessUsefulness.fromJson(
            json['usefulness'] as String,
          ),
      engagement: json['engagement'] == null
          ? null
          : ReaderSummaryPromotionEngagementDto.fromJson(
              json['engagement'] as Map<String, dynamic>,
            ),
      popularity: json['popularity'] == null
          ? null
          : ReaderSummaryPromotionPopularityDto.fromJson(
              json['popularity'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$ReaderSummaryPromotionV3ComparatorDtoToJson(
  ReaderSummaryPromotionV3ComparatorDto instance,
) => <String, dynamic>{
  'block': instance.block,
  'candidateId': instance.candidateId,
  'engagement': instance.engagement,
  'metricMature': instance.metricMature,
  'newsPublisher': instance.newsPublisher,
  'popularity': instance.popularity,
  'providerFamily': instance.providerFamily,
  'publishedAt': instance.publishedAt,
  'relevance': instance.relevance,
  'usefulness': instance.usefulness,
};
