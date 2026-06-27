// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_story_signal_breakdown_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryStorySignalBreakdownDto
_$ReaderSummaryStorySignalBreakdownDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryStorySignalBreakdownDto(
      baseScore: json['baseScore'] as num,
      crossProviderSupport: json['crossProviderSupport'] as num,
      freshnessBoost: json['freshnessBoost'] as num,
      providerDiversityBoost: json['providerDiversityBoost'] as num,
      sameProviderSupport: json['sameProviderSupport'] as num,
      topicDiversityBoost: json['topicDiversityBoost'] as num,
      totalScore: json['totalScore'] as num,
    );

Map<String, dynamic> _$ReaderSummaryStorySignalBreakdownDtoToJson(
  ReaderSummaryStorySignalBreakdownDto instance,
) => <String, dynamic>{
  'baseScore': instance.baseScore,
  'crossProviderSupport': instance.crossProviderSupport,
  'freshnessBoost': instance.freshnessBoost,
  'providerDiversityBoost': instance.providerDiversityBoost,
  'sameProviderSupport': instance.sameProviderSupport,
  'topicDiversityBoost': instance.topicDiversityBoost,
  'totalScore': instance.totalScore,
};
