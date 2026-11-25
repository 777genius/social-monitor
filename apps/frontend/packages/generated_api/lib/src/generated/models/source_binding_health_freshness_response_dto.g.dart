// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_health_freshness_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingHealthFreshnessResponseDto
_$SourceBindingHealthFreshnessResponseDtoFromJson(Map<String, dynamic> json) =>
    SourceBindingHealthFreshnessResponseDto(
      isFresh: json['isFresh'] as bool,
      ageSeconds: json['ageSeconds'] as num?,
      freshnessDeadlineAt: json['freshnessDeadlineAt'] == null
          ? null
          : DateTime.parse(json['freshnessDeadlineAt'] as String),
      staleBySeconds: json['staleBySeconds'] as num?,
    );

Map<String, dynamic> _$SourceBindingHealthFreshnessResponseDtoToJson(
  SourceBindingHealthFreshnessResponseDto instance,
) => <String, dynamic>{
  'ageSeconds': instance.ageSeconds,
  'freshnessDeadlineAt': instance.freshnessDeadlineAt?.toIso8601String(),
  'isFresh': instance.isFresh,
  'staleBySeconds': instance.staleBySeconds,
};
