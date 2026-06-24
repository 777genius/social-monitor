// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_relevance_profile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserRelevanceProfileDto _$UserRelevanceProfileDtoFromJson(
  Map<String, dynamic> json,
) => UserRelevanceProfileDto(
  blockedProviderKeys: (json['blockedProviderKeys'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  id: json['id'] as String,
  keywordWeights: (json['keywordWeights'] as List<dynamic>)
      .map((e) => RelevanceWeightDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  mutedKeywords: (json['mutedKeywords'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  rulesVersion: json['rulesVersion'] as String,
  sourceWeights: (json['sourceWeights'] as List<dynamic>)
      .map((e) => RelevanceWeightDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  topicWeights: (json['topicWeights'] as List<dynamic>)
      .map((e) => RelevanceWeightDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  userId: json['userId'] as String,
);

Map<String, dynamic> _$UserRelevanceProfileDtoToJson(
  UserRelevanceProfileDto instance,
) => <String, dynamic>{
  'blockedProviderKeys': instance.blockedProviderKeys,
  'id': instance.id,
  'keywordWeights': instance.keywordWeights,
  'mutedKeywords': instance.mutedKeywords,
  'rulesVersion': instance.rulesVersion,
  'sourceWeights': instance.sourceWeights,
  'topicWeights': instance.topicWeights,
  'updatedAt': instance.updatedAt.toIso8601String(),
  'userId': instance.userId,
};
