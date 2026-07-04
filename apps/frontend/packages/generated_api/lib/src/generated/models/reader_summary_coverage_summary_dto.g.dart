// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_coverage_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryCoverageSummaryDto _$ReaderSummaryCoverageSummaryDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryCoverageSummaryDto(
  citationCount: json['citationCount'] as num,
  crossSourceClusterCount: json['crossSourceClusterCount'] as num,
  duplicateFeedItemCount: json['duplicateFeedItemCount'] as num,
  freshnessStatus:
      ReaderSummaryCoverageSummaryDtoFreshnessStatusFreshnessStatus.fromJson(
        json['freshnessStatus'] as String,
      ),
  hasCrossProviderEvidence: json['hasCrossProviderEvidence'] as bool,
  interestCount: json['interestCount'] as num,
  isSingleSource: json['isSingleSource'] as bool,
  providerCount: json['providerCount'] as num,
  selectedFeedItemCount: json['selectedFeedItemCount'] as num,
  storyClusterCount: json['storyClusterCount'] as num,
  topInterestIds: (json['topInterestIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  topProviderKeys: (json['topProviderKeys'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  topReadCount: json['topReadCount'] as num,
  windowEndedAt: DateTime.parse(json['windowEndedAt'] as String),
  windowStartedAt: DateTime.parse(json['windowStartedAt'] as String),
  collectedFeedItemCount: json['collectedFeedItemCount'] as num?,
  providerBreakdown: (json['providerBreakdown'] as List<dynamic>?)
      ?.map(
        (e) => ReaderSummaryProviderCoverageDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
);

Map<String, dynamic> _$ReaderSummaryCoverageSummaryDtoToJson(
  ReaderSummaryCoverageSummaryDto instance,
) => <String, dynamic>{
  'citationCount': instance.citationCount,
  'collectedFeedItemCount': instance.collectedFeedItemCount,
  'crossSourceClusterCount': instance.crossSourceClusterCount,
  'duplicateFeedItemCount': instance.duplicateFeedItemCount,
  'freshnessStatus': instance.freshnessStatus,
  'hasCrossProviderEvidence': instance.hasCrossProviderEvidence,
  'interestCount': instance.interestCount,
  'isSingleSource': instance.isSingleSource,
  'providerBreakdown': instance.providerBreakdown,
  'providerCount': instance.providerCount,
  'selectedFeedItemCount': instance.selectedFeedItemCount,
  'storyClusterCount': instance.storyClusterCount,
  'topInterestIds': instance.topInterestIds,
  'topProviderKeys': instance.topProviderKeys,
  'topReadCount': instance.topReadCount,
  'windowEndedAt': instance.windowEndedAt.toIso8601String(),
  'windowStartedAt': instance.windowStartedAt.toIso8601String(),
};
