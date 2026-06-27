// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_risk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryRiskDto _$ReaderSummaryRiskDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryRiskDto(
  description: json['description'] as String,
  citationIds: (json['citationIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  reason: json['reason'] == null
      ? null
      : ReaderSummaryRiskDtoReasonReason.fromJson(json['reason'] as String),
);

Map<String, dynamic> _$ReaderSummaryRiskDtoToJson(
  ReaderSummaryRiskDto instance,
) => <String, dynamic>{
  'citationIds': instance.citationIds,
  'description': instance.description,
  'reason': instance.reason,
};
