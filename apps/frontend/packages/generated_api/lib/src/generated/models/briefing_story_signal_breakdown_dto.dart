// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'briefing_story_signal_breakdown_dto.g.dart';

@JsonSerializable()
class BriefingStorySignalBreakdownDto {
  const BriefingStorySignalBreakdownDto({
    required this.baseScore,
    required this.crossProviderSupport,
    required this.freshnessBoost,
    required this.providerDiversityBoost,
    required this.sameProviderSupport,
    required this.topicDiversityBoost,
    required this.totalScore,
  });

  factory BriefingStorySignalBreakdownDto.fromJson(Map<String, Object?> json) =>
      _$BriefingStorySignalBreakdownDtoFromJson(json);

  final num baseScore;
  final num crossProviderSupport;
  final num freshnessBoost;
  final num providerDiversityBoost;
  final num sameProviderSupport;
  final num topicDiversityBoost;
  final num totalScore;

  Map<String, Object?> toJson() =>
      _$BriefingStorySignalBreakdownDtoToJson(this);
}
