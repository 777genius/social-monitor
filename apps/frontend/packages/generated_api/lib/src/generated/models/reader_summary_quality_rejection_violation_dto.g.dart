// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_quality_rejection_violation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryQualityRejectionViolationDto
_$ReaderSummaryQualityRejectionViolationDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryQualityRejectionViolationDto(
  code: json['code'] as String,
  reason: json['reason'] as String,
  canonicalUrl: json['canonicalUrl'] as String?,
  citationId: json['citationId'] as String?,
  feedItemId: json['feedItemId'] as String?,
  providerKey: json['providerKey'] as String?,
  sourceItemId: json['sourceItemId'] as String?,
  topReadTitle: json['topReadTitle'] as String?,
);

Map<String, dynamic> _$ReaderSummaryQualityRejectionViolationDtoToJson(
  ReaderSummaryQualityRejectionViolationDto instance,
) => <String, dynamic>{
  'canonicalUrl': instance.canonicalUrl,
  'citationId': instance.citationId,
  'code': instance.code,
  'feedItemId': instance.feedItemId,
  'providerKey': instance.providerKey,
  'reason': instance.reason,
  'sourceItemId': instance.sourceItemId,
  'topReadTitle': instance.topReadTitle,
};
