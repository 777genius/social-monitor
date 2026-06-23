// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'briefing_observed_at_range_dto.g.dart';

@JsonSerializable()
class BriefingObservedAtRangeDto {
  const BriefingObservedAtRangeDto({
    required this.endedAt,
    required this.startedAt,
  });

  factory BriefingObservedAtRangeDto.fromJson(Map<String, Object?> json) =>
      _$BriefingObservedAtRangeDtoFromJson(json);

  final DateTime endedAt;
  final DateTime startedAt;

  Map<String, Object?> toJson() => _$BriefingObservedAtRangeDtoToJson(this);
}
