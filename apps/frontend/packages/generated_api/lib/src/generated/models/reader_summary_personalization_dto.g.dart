// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_personalization_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPersonalizationDto _$ReaderSummaryPersonalizationDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryPersonalizationDto(
  blockedProviderCount: json['blockedProviderCount'] as num,
  keywordPreferenceCount: json['keywordPreferenceCount'] as num,
  memoryGuidanceApplied: json['memoryGuidanceApplied'] as bool,
  memoryGuidanceStatus:
      ReaderSummaryPersonalizationDtoMemoryGuidanceStatusMemoryGuidanceStatus.fromJson(
        json['memoryGuidanceStatus'] as String,
      ),
  mutedKeywordCount: json['mutedKeywordCount'] as num,
  providerPreferenceCount: json['providerPreferenceCount'] as num,
  signals: (json['signals'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$ReaderSummaryPersonalizationDtoToJson(
  ReaderSummaryPersonalizationDto instance,
) => <String, dynamic>{
  'blockedProviderCount': instance.blockedProviderCount,
  'keywordPreferenceCount': instance.keywordPreferenceCount,
  'memoryGuidanceApplied': instance.memoryGuidanceApplied,
  'memoryGuidanceStatus': instance.memoryGuidanceStatus,
  'mutedKeywordCount': instance.mutedKeywordCount,
  'providerPreferenceCount': instance.providerPreferenceCount,
  'signals': instance.signals,
};
