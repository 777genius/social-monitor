// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_promotion_engagement_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPromotionEngagementDto
_$ReaderSummaryPromotionEngagementDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryPromotionEngagementDto(
      method: ReaderSummaryPromotionEngagementDtoMethodMethod.fromJson(
        json['method'] as String,
      ),
      observedAt: json['observedAt'] as String,
      value: json['value'] as num,
    );

Map<String, dynamic> _$ReaderSummaryPromotionEngagementDtoToJson(
  ReaderSummaryPromotionEngagementDto instance,
) => <String, dynamic>{
  'method': instance.method,
  'observedAt': instance.observedAt,
  'value': instance.value,
};
