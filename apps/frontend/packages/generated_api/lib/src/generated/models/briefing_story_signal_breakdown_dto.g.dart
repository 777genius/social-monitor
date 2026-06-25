// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_story_signal_breakdown_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingStorySignalBreakdownDto _$BriefingStorySignalBreakdownDtoFromJson(
  Map<String, dynamic> json,
) => BriefingStorySignalBreakdownDto(
  baseScore: json['baseScore'] as num,
  crossProviderSupport: json['crossProviderSupport'] as num,
  freshnessBoost: json['freshnessBoost'] as num,
  providerDiversityBoost: json['providerDiversityBoost'] as num,
  sameProviderSupport: json['sameProviderSupport'] as num,
  topicDiversityBoost: json['topicDiversityBoost'] as num,
  totalScore: json['totalScore'] as num,
);

Map<String, dynamic> _$BriefingStorySignalBreakdownDtoToJson(
  BriefingStorySignalBreakdownDto instance,
) => <String, dynamic>{
  'baseScore': instance.baseScore,
  'crossProviderSupport': instance.crossProviderSupport,
  'freshnessBoost': instance.freshnessBoost,
  'providerDiversityBoost': instance.providerDiversityBoost,
  'sameProviderSupport': instance.sameProviderSupport,
  'topicDiversityBoost': instance.topicDiversityBoost,
  'totalScore': instance.totalScore,
};
