// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_quality_rejection_shadow_signal_dto.g.dart';

@JsonSerializable()
class ReaderSummaryQualityRejectionShadowSignalDto {
  const ReaderSummaryQualityRejectionShadowSignalDto({
    required this.code,
    required this.reason,
    required this.score,
  });

  factory ReaderSummaryQualityRejectionShadowSignalDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryQualityRejectionShadowSignalDtoFromJson(json);

  final String code;
  final String reason;
  final num score;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryQualityRejectionShadowSignalDtoToJson(this);
}
