// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_trend_delta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingTrendDeltaDto _$BriefingTrendDeltaDtoFromJson(
  Map<String, dynamic> json,
) => BriefingTrendDeltaDto(
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

Map<String, dynamic> _$BriefingTrendDeltaDtoToJson(
  BriefingTrendDeltaDto instance,
) => <String, dynamic>{
  'fadingSignals': instance.fadingSignals,
  'growingSignals': instance.growingSignals,
  'newSignals': instance.newSignals,
  'repeatedSignals': instance.repeatedSignals,
};
