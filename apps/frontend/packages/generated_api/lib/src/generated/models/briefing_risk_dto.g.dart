// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_risk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingRiskDto _$BriefingRiskDtoFromJson(Map<String, dynamic> json) =>
    BriefingRiskDto(
      description: json['description'] as String,
      citationIds: (json['citationIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      reason: json['reason'] == null
          ? null
          : BriefingRiskDtoReasonReason.fromJson(json['reason'] as String),
    );

Map<String, dynamic> _$BriefingRiskDtoToJson(BriefingRiskDto instance) =>
    <String, dynamic>{
      'citationIds': instance.citationIds,
      'description': instance.description,
      'reason': instance.reason,
    };
