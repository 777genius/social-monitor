// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_story_cluster_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingStoryClusterDto _$BriefingStoryClusterDtoFromJson(
  Map<String, dynamic> json,
) => BriefingStoryClusterDto(
  duplicateFeedItemIds: (json['duplicateFeedItemIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  id: json['id'] as String,
  observedAtRange: BriefingObservedAtRangeDto.fromJson(
    json['observedAtRange'] as Map<String, dynamic>,
  ),
  providerKeys: (json['providerKeys'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  representativeFeedItemId: json['representativeFeedItemId'] as String,
  score: json['score'] as num,
  storyKey: json['storyKey'] as String,
  topicIds: (json['topicIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  whyImportant: (json['whyImportant'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  rankingPolicyVersion: json['rankingPolicyVersion'] as String?,
  signalBreakdown: json['signalBreakdown'] == null
      ? null
      : BriefingStorySignalBreakdownDto.fromJson(
          json['signalBreakdown'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$BriefingStoryClusterDtoToJson(
  BriefingStoryClusterDto instance,
) => <String, dynamic>{
  'duplicateFeedItemIds': instance.duplicateFeedItemIds,
  'id': instance.id,
  'observedAtRange': instance.observedAtRange,
  'providerKeys': instance.providerKeys,
  'rankingPolicyVersion': instance.rankingPolicyVersion,
  'representativeFeedItemId': instance.representativeFeedItemId,
  'score': instance.score,
  'signalBreakdown': instance.signalBreakdown,
  'storyKey': instance.storyKey,
  'topicIds': instance.topicIds,
  'whyImportant': instance.whyImportant,
};
