// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_signal_cohort_dto_baseline_window_baseline_window.dart';
import 'feed_signal_cohort_dto_fallback_fallback.dart';

part 'feed_signal_cohort_dto.g.dart';

@JsonSerializable()
class FeedSignalCohortDto {
  const FeedSignalCohortDto({
    required this.ageBucket,
    required this.baselineWindow,
    required this.contentType,
    required this.fallback,
    required this.percentile,
    required this.providerKey,
    required this.sampleSize,
    required this.sourceKey,
    required this.zScore,
  });

  factory FeedSignalCohortDto.fromJson(Map<String, Object?> json) =>
      _$FeedSignalCohortDtoFromJson(json);

  final String ageBucket;
  final FeedSignalCohortDtoBaselineWindowBaselineWindow baselineWindow;
  final String contentType;
  final FeedSignalCohortDtoFallbackFallback fallback;
  final num percentile;
  final String providerKey;
  final num sampleSize;
  final String sourceKey;
  final num zScore;

  Map<String, Object?> toJson() => _$FeedSignalCohortDtoToJson(this);
}
