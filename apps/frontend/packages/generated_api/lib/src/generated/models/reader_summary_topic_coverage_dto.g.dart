// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_topic_coverage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTopicCoverageDto _$ReaderSummaryTopicCoverageDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTopicCoverageDto(
  collectedFeedItemCount: json['collectedFeedItemCount'] as num,
  lowRelevanceFeedItemCount: json['lowRelevanceFeedItemCount'] as num,
  mutedFeedItemCount: json['mutedFeedItemCount'] as num,
  topicKey: json['topicKey'] as String,
  userRatedFeedItemCount: json['userRatedFeedItemCount'] as num,
  topicLabel: json['topicLabel'] as String?,
);

Map<String, dynamic> _$ReaderSummaryTopicCoverageDtoToJson(
  ReaderSummaryTopicCoverageDto instance,
) => <String, dynamic>{
  'collectedFeedItemCount': instance.collectedFeedItemCount,
  'lowRelevanceFeedItemCount': instance.lowRelevanceFeedItemCount,
  'mutedFeedItemCount': instance.mutedFeedItemCount,
  'topicKey': instance.topicKey,
  'topicLabel': instance.topicLabel,
  'userRatedFeedItemCount': instance.userRatedFeedItemCount,
};
