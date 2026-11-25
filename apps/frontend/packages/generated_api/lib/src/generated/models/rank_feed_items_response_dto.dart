// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ranked_feed_item_dto.dart';
import 'relevance_memory_guidance_dto.dart';
import 'user_relevance_profile_dto.dart';

part 'rank_feed_items_response_dto.g.dart';

@JsonSerializable()
class RankFeedItemsResponseDto {
  const RankFeedItemsResponseDto({
    required this.generatedAt,
    required this.items,
    required this.profileApplied,
    this.memoryGuidance,
    this.profile,
  });

  factory RankFeedItemsResponseDto.fromJson(Map<String, Object?> json) =>
      _$RankFeedItemsResponseDtoFromJson(json);

  final DateTime generatedAt;
  final List<RankedFeedItemDto> items;
  final RelevanceMemoryGuidanceDto? memoryGuidance;
  final UserRelevanceProfileDto? profile;
  final bool profileApplied;

  Map<String, Object?> toJson() => _$RankFeedItemsResponseDtoToJson(this);
}
