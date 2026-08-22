// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feed_metric_delta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeedMetricDeltaDto _$FeedMetricDeltaDtoFromJson(Map<String, dynamic> json) =>
    FeedMetricDeltaDto(
      window: json['window'] as String,
      observation: json['observation'] == null
          ? null
          : FeedMetricDeltaDtoObservationObservation.fromJson(
              json['observation'] as String,
            ),
      value: json['value'] as num?,
    );

Map<String, dynamic> _$FeedMetricDeltaDtoToJson(FeedMetricDeltaDto instance) =>
    <String, dynamic>{
      'observation': instance.observation,
      'value': instance.value,
      'window': instance.window,
    };
