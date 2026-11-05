// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_promotion_popularity_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPromotionPopularityDto
_$ReaderSummaryPromotionPopularityDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryPromotionPopularityDto(
      below: json['below'] as num,
      cohortSize: json['cohortSize'] as num,
      equal: json['equal'] as num,
    );

Map<String, dynamic> _$ReaderSummaryPromotionPopularityDtoToJson(
  ReaderSummaryPromotionPopularityDto instance,
) => <String, dynamic>{
  'below': instance.below,
  'cohortSize': instance.cohortSize,
  'equal': instance.equal,
};
