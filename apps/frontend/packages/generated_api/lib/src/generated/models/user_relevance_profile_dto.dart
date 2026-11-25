// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'relevance_weight_dto.dart';

part 'user_relevance_profile_dto.g.dart';

@JsonSerializable()
class UserRelevanceProfileDto {
  const UserRelevanceProfileDto({
    required this.blockedProviderKeys,
    required this.id,
    required this.interestWeights,
    required this.keywordWeights,
    required this.mutedKeywords,
    required this.rulesVersion,
    required this.sourceWeights,
    required this.updatedAt,
    required this.userId,
  });

  factory UserRelevanceProfileDto.fromJson(Map<String, Object?> json) =>
      _$UserRelevanceProfileDtoFromJson(json);

  final List<String> blockedProviderKeys;
  final String id;
  final List<RelevanceWeightDto> interestWeights;
  final List<RelevanceWeightDto> keywordWeights;
  final List<String> mutedKeywords;
  final String rulesVersion;
  final List<RelevanceWeightDto> sourceWeights;
  final DateTime updatedAt;
  final String userId;

  Map<String, Object?> toJson() => _$UserRelevanceProfileDtoToJson(this);
}
