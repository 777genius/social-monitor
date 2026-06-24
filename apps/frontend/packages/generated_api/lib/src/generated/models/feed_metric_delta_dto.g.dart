// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feed_metric_delta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeedMetricDeltaDto _$FeedMetricDeltaDtoFromJson(Map<String, dynamic> json) =>
    FeedMetricDeltaDto(
      value: json['value'] as num,
      window: json['window'] as String,
    );

Map<String, dynamic> _$FeedMetricDeltaDtoToJson(FeedMetricDeltaDto instance) =>
    <String, dynamic>{'value': instance.value, 'window': instance.window};
