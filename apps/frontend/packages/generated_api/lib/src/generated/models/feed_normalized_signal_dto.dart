// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_normalized_signal_dto_band_band.dart';
import 'feed_normalized_signal_dto_basis_basis.dart';
import 'feed_signal_cohort_dto.dart';

part 'feed_normalized_signal_dto.g.dart';

@JsonSerializable()
class FeedNormalizedSignalDto {
  const FeedNormalizedSignalDto({
    required this.band,
    required this.basis,
    required this.cohort,
    required this.computedAt,
    required this.confidence,
    required this.score,
  });

  factory FeedNormalizedSignalDto.fromJson(Map<String, Object?> json) =>
      _$FeedNormalizedSignalDtoFromJson(json);

  final FeedNormalizedSignalDtoBandBand band;
  final FeedNormalizedSignalDtoBasisBasis basis;
  final FeedSignalCohortDto cohort;
  final DateTime computedAt;
  final num confidence;
  final num score;

  Map<String, Object?> toJson() => _$FeedNormalizedSignalDtoToJson(this);
}
