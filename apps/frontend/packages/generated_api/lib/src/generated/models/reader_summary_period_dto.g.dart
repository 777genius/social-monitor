// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_period_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPeriodDto _$ReaderSummaryPeriodDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryPeriodDto(
  cadence: ReaderSummaryPeriodDtoCadenceCadence.fromJson(
    json['cadence'] as String,
  ),
  endedAt: DateTime.parse(json['endedAt'] as String),
  periodKey: json['periodKey'] as String,
  startedAt: DateTime.parse(json['startedAt'] as String),
  timezone: json['timezone'] as String,
);

Map<String, dynamic> _$ReaderSummaryPeriodDtoToJson(
  ReaderSummaryPeriodDto instance,
) => <String, dynamic>{
  'cadence': instance.cadence,
  'endedAt': instance.endedAt.toIso8601String(),
  'periodKey': instance.periodKey,
  'startedAt': instance.startedAt.toIso8601String(),
  'timezone': instance.timezone,
};
