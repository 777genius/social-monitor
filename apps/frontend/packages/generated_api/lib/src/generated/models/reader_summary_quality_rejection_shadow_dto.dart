// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_quality_rejection_shadow_dto_mode_mode.dart';
import 'reader_summary_quality_rejection_shadow_signal_dto.dart';

part 'reader_summary_quality_rejection_shadow_dto.g.dart';

@JsonSerializable()
class ReaderSummaryQualityRejectionShadowDto {
  const ReaderSummaryQualityRejectionShadowDto({
    required this.mode,
    required this.riskScore,
    required this.signals,
  });

  factory ReaderSummaryQualityRejectionShadowDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryQualityRejectionShadowDtoFromJson(json);

  final ReaderSummaryQualityRejectionShadowDtoModeMode mode;
  final num riskScore;
  final List<ReaderSummaryQualityRejectionShadowSignalDto> signals;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryQualityRejectionShadowDtoToJson(this);
}
