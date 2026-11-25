// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'request_reader_summary_period_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RequestReaderSummaryPeriodDto _$RequestReaderSummaryPeriodDtoFromJson(
  Map<String, dynamic> json,
) => RequestReaderSummaryPeriodDto(
  endedAt: DateTime.parse(json['endedAt'] as String),
  startedAt: DateTime.parse(json['startedAt'] as String),
  timezone: json['timezone'] as String,
);

Map<String, dynamic> _$RequestReaderSummaryPeriodDtoToJson(
  RequestReaderSummaryPeriodDto instance,
) => <String, dynamic>{
  'endedAt': instance.endedAt.toIso8601String(),
  'startedAt': instance.startedAt.toIso8601String(),
  'timezone': instance.timezone,
};
