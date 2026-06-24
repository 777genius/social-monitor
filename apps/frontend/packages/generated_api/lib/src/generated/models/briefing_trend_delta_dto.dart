// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'briefing_trend_delta_dto.g.dart';

@JsonSerializable()
class BriefingTrendDeltaDto {
  const BriefingTrendDeltaDto({
    required this.fadingSignals,
    required this.growingSignals,
    required this.newSignals,
    required this.repeatedSignals,
  });

  factory BriefingTrendDeltaDto.fromJson(Map<String, Object?> json) =>
      _$BriefingTrendDeltaDtoFromJson(json);

  final List<String> fadingSignals;
  final List<String> growingSignals;
  final List<String> newSignals;
  final List<String> repeatedSignals;

  Map<String, Object?> toJson() => _$BriefingTrendDeltaDtoToJson(this);
}
