// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'relevance_memory_guidance_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RelevanceMemoryGuidanceDto _$RelevanceMemoryGuidanceDtoFromJson(
  Map<String, dynamic> json,
) => RelevanceMemoryGuidanceDto(
  applied: json['applied'] as bool,
  blockedProviderCount: json['blockedProviderCount'] as num,
  keywordPreferenceCount: json['keywordPreferenceCount'] as num,
  mutedKeywordCount: json['mutedKeywordCount'] as num,
  providerPreferenceCount: json['providerPreferenceCount'] as num,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
  status: RelevanceMemoryGuidanceDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
);

Map<String, dynamic> _$RelevanceMemoryGuidanceDtoToJson(
  RelevanceMemoryGuidanceDto instance,
) => <String, dynamic>{
  'applied': instance.applied,
  'blockedProviderCount': instance.blockedProviderCount,
  'keywordPreferenceCount': instance.keywordPreferenceCount,
  'mutedKeywordCount': instance.mutedKeywordCount,
  'providerPreferenceCount': instance.providerPreferenceCount,
  'signals': instance.signals,
  'status': instance.status,
};
