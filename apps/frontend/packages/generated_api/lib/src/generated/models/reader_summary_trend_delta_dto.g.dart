// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_trend_delta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTrendDeltaDto _$ReaderSummaryTrendDeltaDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTrendDeltaDto(
  fadingSignals: (json['fadingSignals'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  growingSignals: (json['growingSignals'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  newSignals: (json['newSignals'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  repeatedSignals: (json['repeatedSignals'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$ReaderSummaryTrendDeltaDtoToJson(
  ReaderSummaryTrendDeltaDto instance,
) => <String, dynamic>{
  'fadingSignals': instance.fadingSignals,
  'growingSignals': instance.growingSignals,
  'newSignals': instance.newSignals,
  'repeatedSignals': instance.repeatedSignals,
};
