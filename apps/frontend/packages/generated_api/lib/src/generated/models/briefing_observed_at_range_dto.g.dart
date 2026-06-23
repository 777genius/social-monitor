// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_observed_at_range_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingObservedAtRangeDto _$BriefingObservedAtRangeDtoFromJson(
  Map<String, dynamic> json,
) => BriefingObservedAtRangeDto(
  endedAt: DateTime.parse(json['endedAt'] as String),
  startedAt: DateTime.parse(json['startedAt'] as String),
);

Map<String, dynamic> _$BriefingObservedAtRangeDtoToJson(
  BriefingObservedAtRangeDto instance,
) => <String, dynamic>{
  'endedAt': instance.endedAt.toIso8601String(),
  'startedAt': instance.startedAt.toIso8601String(),
};
