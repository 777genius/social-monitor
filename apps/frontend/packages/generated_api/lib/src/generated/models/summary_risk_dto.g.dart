// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'summary_risk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SummaryRiskDto _$SummaryRiskDtoFromJson(Map<String, dynamic> json) =>
    SummaryRiskDto(
      description: json['description'] as String,
      citationIds: (json['citationIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      reason: json['reason'] == null
          ? null
          : SummaryRiskDtoReasonReason.fromJson(json['reason'] as String),
    );

Map<String, dynamic> _$SummaryRiskDtoToJson(SummaryRiskDto instance) =>
    <String, dynamic>{
      'citationIds': instance.citationIds,
      'description': instance.description,
      'reason': instance.reason,
    };
