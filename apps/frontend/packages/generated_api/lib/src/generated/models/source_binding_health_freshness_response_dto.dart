// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'source_binding_health_freshness_response_dto.g.dart';

@JsonSerializable()
class SourceBindingHealthFreshnessResponseDto {
  const SourceBindingHealthFreshnessResponseDto({
    required this.isFresh,
    this.ageSeconds,
    this.freshnessDeadlineAt,
    this.staleBySeconds,
  });

  factory SourceBindingHealthFreshnessResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingHealthFreshnessResponseDtoFromJson(json);

  final num? ageSeconds;
  final DateTime? freshnessDeadlineAt;
  final bool isFresh;
  final num? staleBySeconds;

  Map<String, Object?> toJson() =>
      _$SourceBindingHealthFreshnessResponseDtoToJson(this);
}
