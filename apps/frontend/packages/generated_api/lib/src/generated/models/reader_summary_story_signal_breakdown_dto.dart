// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_story_signal_breakdown_dto.g.dart';

@JsonSerializable()
class ReaderSummaryStorySignalBreakdownDto {
  const ReaderSummaryStorySignalBreakdownDto({
    required this.baseScore,
    required this.crossProviderSupport,
    required this.freshnessBoost,
    required this.providerDiversityBoost,
    required this.sameProviderSupport,
    required this.topicDiversityBoost,
    required this.totalScore,
  });

  factory ReaderSummaryStorySignalBreakdownDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryStorySignalBreakdownDtoFromJson(json);

  final num baseScore;
  final num crossProviderSupport;
  final num freshnessBoost;
  final num providerDiversityBoost;
  final num sameProviderSupport;
  final num topicDiversityBoost;
  final num totalScore;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryStorySignalBreakdownDtoToJson(this);
}
