// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_query_coverage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryQueryCoverageDto _$ReaderSummaryQueryCoverageDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryQueryCoverageDto(
  collectedFeedItemCount: json['collectedFeedItemCount'] as num,
  lowRelevanceFeedItemCount: json['lowRelevanceFeedItemCount'] as num,
  mutedFeedItemCount: json['mutedFeedItemCount'] as num,
  query: json['query'] as String,
  userRatedFeedItemCount: json['userRatedFeedItemCount'] as num,
);

Map<String, dynamic> _$ReaderSummaryQueryCoverageDtoToJson(
  ReaderSummaryQueryCoverageDto instance,
) => <String, dynamic>{
  'collectedFeedItemCount': instance.collectedFeedItemCount,
  'lowRelevanceFeedItemCount': instance.lowRelevanceFeedItemCount,
  'mutedFeedItemCount': instance.mutedFeedItemCount,
  'query': instance.query,
  'userRatedFeedItemCount': instance.userRatedFeedItemCount,
};
