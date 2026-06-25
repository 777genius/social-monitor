// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_observed_at_range_dto.dart';
import 'briefing_story_signal_breakdown_dto.dart';

part 'briefing_story_cluster_dto.g.dart';

@JsonSerializable()
class BriefingStoryClusterDto {
  const BriefingStoryClusterDto({
    required this.duplicateFeedItemIds,
    required this.id,
    required this.observedAtRange,
    required this.providerKeys,
    required this.representativeFeedItemId,
    required this.score,
    required this.storyKey,
    required this.topicIds,
    required this.whyImportant,
    this.rankingPolicyVersion,
    this.signalBreakdown,
  });

  factory BriefingStoryClusterDto.fromJson(Map<String, Object?> json) =>
      _$BriefingStoryClusterDtoFromJson(json);

  final List<String> duplicateFeedItemIds;
  final String id;
  final BriefingObservedAtRangeDto observedAtRange;
  final List<String> providerKeys;
  final String? rankingPolicyVersion;
  final String representativeFeedItemId;
  final num score;
  final BriefingStorySignalBreakdownDto? signalBreakdown;
  final String storyKey;
  final List<String> topicIds;
  final List<String> whyImportant;

  Map<String, Object?> toJson() => _$BriefingStoryClusterDtoToJson(this);
}
