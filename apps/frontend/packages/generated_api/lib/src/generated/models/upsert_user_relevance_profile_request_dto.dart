// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'relevance_weight_dto.dart';

part 'upsert_user_relevance_profile_request_dto.g.dart';

@JsonSerializable()
class UpsertUserRelevanceProfileRequestDto {
  const UpsertUserRelevanceProfileRequestDto({
    this.blockedProviderKeys,
    this.keywordWeights,
    this.mutedKeywords,
    this.sourceWeights,
    this.topicWeights,
  });

  factory UpsertUserRelevanceProfileRequestDto.fromJson(
    Map<String, Object?> json,
  ) => _$UpsertUserRelevanceProfileRequestDtoFromJson(json);

  final List<String>? blockedProviderKeys;
  final List<RelevanceWeightDto>? keywordWeights;
  final List<String>? mutedKeywords;
  final List<RelevanceWeightDto>? sourceWeights;
  final List<RelevanceWeightDto>? topicWeights;

  Map<String, Object?> toJson() =>
      _$UpsertUserRelevanceProfileRequestDtoToJson(this);
}
