// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_observed_at_range_dto.dart';
import 'reader_summary_story_signal_breakdown_dto.dart';

part 'reader_summary_story_cluster_dto.g.dart';

@JsonSerializable()
class ReaderSummaryStoryClusterDto {
  const ReaderSummaryStoryClusterDto({
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

  factory ReaderSummaryStoryClusterDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryStoryClusterDtoFromJson(json);

  final List<String> duplicateFeedItemIds;
  final String id;
  final ReaderSummaryObservedAtRangeDto observedAtRange;
  final List<String> providerKeys;
  final String? rankingPolicyVersion;
  final String representativeFeedItemId;
  final num score;
  final ReaderSummaryStorySignalBreakdownDto? signalBreakdown;
  final String storyKey;
  final List<String> topicIds;
  final List<String> whyImportant;

  Map<String, Object?> toJson() => _$ReaderSummaryStoryClusterDtoToJson(this);
}
