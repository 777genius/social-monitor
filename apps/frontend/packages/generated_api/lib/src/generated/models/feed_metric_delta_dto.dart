// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'feed_metric_delta_dto.g.dart';

@JsonSerializable()
class FeedMetricDeltaDto {
  const FeedMetricDeltaDto({required this.value, required this.window});

  factory FeedMetricDeltaDto.fromJson(Map<String, Object?> json) =>
      _$FeedMetricDeltaDtoFromJson(json);

  final num value;
  final String window;

  Map<String, Object?> toJson() => _$FeedMetricDeltaDtoToJson(this);
}
