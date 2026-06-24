// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upsert_user_relevance_profile_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpsertUserRelevanceProfileRequestDto
_$UpsertUserRelevanceProfileRequestDtoFromJson(Map<String, dynamic> json) =>
    UpsertUserRelevanceProfileRequestDto(
      blockedProviderKeys: (json['blockedProviderKeys'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      keywordWeights: (json['keywordWeights'] as List<dynamic>?)
          ?.map((e) => RelevanceWeightDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      mutedKeywords: (json['mutedKeywords'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      sourceWeights: (json['sourceWeights'] as List<dynamic>?)
          ?.map((e) => RelevanceWeightDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      topicWeights: (json['topicWeights'] as List<dynamic>?)
          ?.map((e) => RelevanceWeightDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$UpsertUserRelevanceProfileRequestDtoToJson(
  UpsertUserRelevanceProfileRequestDto instance,
) => <String, dynamic>{
  'blockedProviderKeys': instance.blockedProviderKeys,
  'keywordWeights': instance.keywordWeights,
  'mutedKeywords': instance.mutedKeywords,
  'sourceWeights': instance.sourceWeights,
  'topicWeights': instance.topicWeights,
};
