// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_story_cluster_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryStoryClusterDto _$ReaderSummaryStoryClusterDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryStoryClusterDto(
  duplicateFeedItemIds: (json['duplicateFeedItemIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  id: json['id'] as String,
  interestIds: (json['interestIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  observedAtRange: ReaderSummaryObservedAtRangeDto.fromJson(
    json['observedAtRange'] as Map<String, dynamic>,
  ),
  providerKeys: (json['providerKeys'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  representativeFeedItemId: json['representativeFeedItemId'] as String,
  score: json['score'] as num,
  storyKey: json['storyKey'] as String,
  whyImportant: (json['whyImportant'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  rankingPolicyVersion: json['rankingPolicyVersion'] as String?,
  signalBreakdown: json['signalBreakdown'] == null
      ? null
      : ReaderSummaryStorySignalBreakdownDto.fromJson(
          json['signalBreakdown'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$ReaderSummaryStoryClusterDtoToJson(
  ReaderSummaryStoryClusterDto instance,
) => <String, dynamic>{
  'duplicateFeedItemIds': instance.duplicateFeedItemIds,
  'id': instance.id,
  'interestIds': instance.interestIds,
  'observedAtRange': instance.observedAtRange,
  'providerKeys': instance.providerKeys,
  'rankingPolicyVersion': instance.rankingPolicyVersion,
  'representativeFeedItemId': instance.representativeFeedItemId,
  'score': instance.score,
  'signalBreakdown': instance.signalBreakdown,
  'storyKey': instance.storyKey,
  'whyImportant': instance.whyImportant,
};
