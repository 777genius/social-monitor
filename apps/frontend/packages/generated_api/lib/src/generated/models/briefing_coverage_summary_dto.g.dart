// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_coverage_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingCoverageSummaryDto _$BriefingCoverageSummaryDtoFromJson(
  Map<String, dynamic> json,
) => BriefingCoverageSummaryDto(
  citationCount: json['citationCount'] as num,
  crossSourceClusterCount: json['crossSourceClusterCount'] as num,
  duplicateFeedItemCount: json['duplicateFeedItemCount'] as num,
  freshnessStatus:
      BriefingCoverageSummaryDtoFreshnessStatusFreshnessStatus.fromJson(
        json['freshnessStatus'] as String,
      ),
  hasCrossProviderEvidence: json['hasCrossProviderEvidence'] as bool,
  isSingleSource: json['isSingleSource'] as bool,
  providerCount: json['providerCount'] as num,
  selectedFeedItemCount: json['selectedFeedItemCount'] as num,
  storyClusterCount: json['storyClusterCount'] as num,
  topicCount: json['topicCount'] as num,
  topProviderKeys: (json['topProviderKeys'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  topReadCount: json['topReadCount'] as num,
  topTopicIds: (json['topTopicIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  windowEndedAt: DateTime.parse(json['windowEndedAt'] as String),
  windowStartedAt: DateTime.parse(json['windowStartedAt'] as String),
);

Map<String, dynamic> _$BriefingCoverageSummaryDtoToJson(
  BriefingCoverageSummaryDto instance,
) => <String, dynamic>{
  'citationCount': instance.citationCount,
  'crossSourceClusterCount': instance.crossSourceClusterCount,
  'duplicateFeedItemCount': instance.duplicateFeedItemCount,
  'freshnessStatus': instance.freshnessStatus,
  'hasCrossProviderEvidence': instance.hasCrossProviderEvidence,
  'isSingleSource': instance.isSingleSource,
  'providerCount': instance.providerCount,
  'selectedFeedItemCount': instance.selectedFeedItemCount,
  'storyClusterCount': instance.storyClusterCount,
  'topicCount': instance.topicCount,
  'topProviderKeys': instance.topProviderKeys,
  'topReadCount': instance.topReadCount,
  'topTopicIds': instance.topTopicIds,
  'windowEndedAt': instance.windowEndedAt.toIso8601String(),
  'windowStartedAt': instance.windowStartedAt.toIso8601String(),
};
