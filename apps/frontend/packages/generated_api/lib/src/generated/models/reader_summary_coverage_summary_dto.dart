// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_coverage_summary_dto_freshness_status_freshness_status.dart';

part 'reader_summary_coverage_summary_dto.g.dart';

@JsonSerializable()
class ReaderSummaryCoverageSummaryDto {
  const ReaderSummaryCoverageSummaryDto({
    required this.citationCount,
    required this.crossSourceClusterCount,
    required this.duplicateFeedItemCount,
    required this.freshnessStatus,
    required this.hasCrossProviderEvidence,
    required this.interestCount,
    required this.isSingleSource,
    required this.providerCount,
    required this.selectedFeedItemCount,
    required this.storyClusterCount,
    required this.topInterestIds,
    required this.topProviderKeys,
    required this.topReadCount,
    required this.windowEndedAt,
    required this.windowStartedAt,
  });

  factory ReaderSummaryCoverageSummaryDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryCoverageSummaryDtoFromJson(json);

  final num citationCount;
  final num crossSourceClusterCount;
  final num duplicateFeedItemCount;
  final ReaderSummaryCoverageSummaryDtoFreshnessStatusFreshnessStatus
  freshnessStatus;
  final bool hasCrossProviderEvidence;
  final num interestCount;
  final bool isSingleSource;
  final num providerCount;
  final num selectedFeedItemCount;
  final num storyClusterCount;
  final List<String> topInterestIds;
  final List<String> topProviderKeys;
  final num topReadCount;
  final DateTime windowEndedAt;
  final DateTime windowStartedAt;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryCoverageSummaryDtoToJson(this);
}
