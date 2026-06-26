// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_personalization_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingPersonalizationDto _$BriefingPersonalizationDtoFromJson(
  Map<String, dynamic> json,
) => BriefingPersonalizationDto(
  blockedProviderCount: json['blockedProviderCount'] as num,
  keywordPreferenceCount: json['keywordPreferenceCount'] as num,
  memoryGuidanceApplied: json['memoryGuidanceApplied'] as bool,
  memoryGuidanceStatus:
      BriefingPersonalizationDtoMemoryGuidanceStatusMemoryGuidanceStatus.fromJson(
        json['memoryGuidanceStatus'] as String,
      ),
  mutedKeywordCount: json['mutedKeywordCount'] as num,
  providerPreferenceCount: json['providerPreferenceCount'] as num,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$BriefingPersonalizationDtoToJson(
  BriefingPersonalizationDto instance,
) => <String, dynamic>{
  'blockedProviderCount': instance.blockedProviderCount,
  'keywordPreferenceCount': instance.keywordPreferenceCount,
  'memoryGuidanceApplied': instance.memoryGuidanceApplied,
  'memoryGuidanceStatus': instance.memoryGuidanceStatus,
  'mutedKeywordCount': instance.mutedKeywordCount,
  'providerPreferenceCount': instance.providerPreferenceCount,
  'signals': instance.signals,
};
