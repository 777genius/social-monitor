// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_observed_at_range_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryObservedAtRangeDto _$ReaderSummaryObservedAtRangeDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryObservedAtRangeDto(
  endedAt: DateTime.parse(json['endedAt'] as String),
  startedAt: DateTime.parse(json['startedAt'] as String),
);

Map<String, dynamic> _$ReaderSummaryObservedAtRangeDtoToJson(
  ReaderSummaryObservedAtRangeDto instance,
) => <String, dynamic>{
  'endedAt': instance.endedAt.toIso8601String(),
  'startedAt': instance.startedAt.toIso8601String(),
};
