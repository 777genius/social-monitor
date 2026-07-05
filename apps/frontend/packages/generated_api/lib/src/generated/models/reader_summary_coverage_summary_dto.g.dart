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
  lowRelevanceFeedItemCount: json['lowRelevanceFeedItemCount'] as num,
  mutedFeedItemCount: json['mutedFeedItemCount'] as num,
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
  userRatedFeedItemCount: json['userRatedFeedItemCount'] as num,
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
  queryBreakdown: (json['queryBreakdown'] as List<dynamic>?)
      ?.map(
        (e) =>
            ReaderSummaryQueryCoverageDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  topicBreakdown: (json['topicBreakdown'] as List<dynamic>?)
      ?.map(
        (e) =>
            ReaderSummaryTopicCoverageDto.fromJson(e as Map<String, dynamic>),
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
  'lowRelevanceFeedItemCount': instance.lowRelevanceFeedItemCount,
  'mutedFeedItemCount': instance.mutedFeedItemCount,
  'providerBreakdown': instance.providerBreakdown,
  'providerCount': instance.providerCount,
  'queryBreakdown': instance.queryBreakdown,
  'selectedFeedItemCount': instance.selectedFeedItemCount,
  'storyClusterCount': instance.storyClusterCount,
  'topicBreakdown': instance.topicBreakdown,
  'topInterestIds': instance.topInterestIds,
  'topProviderKeys': instance.topProviderKeys,
  'topReadCount': instance.topReadCount,
  'userRatedFeedItemCount': instance.userRatedFeedItemCount,
  'windowEndedAt': instance.windowEndedAt.toIso8601String(),
  'windowStartedAt': instance.windowStartedAt.toIso8601String(),
};
