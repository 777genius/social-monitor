// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_coverage_summary_dto_freshness_status_freshness_status.dart';

part 'briefing_coverage_summary_dto.g.dart';

@JsonSerializable()
class BriefingCoverageSummaryDto {
  const BriefingCoverageSummaryDto({
    required this.citationCount,
    required this.crossSourceClusterCount,
    required this.duplicateFeedItemCount,
    required this.freshnessStatus,
    required this.hasCrossProviderEvidence,
    required this.isSingleSource,
    required this.providerCount,
    required this.selectedFeedItemCount,
    required this.storyClusterCount,
    required this.topicCount,
    required this.topProviderKeys,
    required this.topReadCount,
    required this.topTopicIds,
    required this.windowEndedAt,
    required this.windowStartedAt,
  });

  factory BriefingCoverageSummaryDto.fromJson(Map<String, Object?> json) =>
      _$BriefingCoverageSummaryDtoFromJson(json);

  final num citationCount;
  final num crossSourceClusterCount;
  final num duplicateFeedItemCount;
  final BriefingCoverageSummaryDtoFreshnessStatusFreshnessStatus
  freshnessStatus;
  final bool hasCrossProviderEvidence;
  final bool isSingleSource;
  final num providerCount;
  final num selectedFeedItemCount;
  final num storyClusterCount;
  final num topicCount;
  final List<String> topProviderKeys;
  final num topReadCount;
  final List<String> topTopicIds;
  final DateTime windowEndedAt;
  final DateTime windowStartedAt;

  Map<String, Object?> toJson() => _$BriefingCoverageSummaryDtoToJson(this);
}
