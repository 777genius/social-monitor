// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'build_personalized_digest_response_dto_status_status.dart';
import 'personalized_digest_window_dto.dart';
import 'ranked_feed_item_dto.dart';
import 'relevance_memory_guidance_dto.dart';

part 'build_personalized_digest_response_dto.g.dart';

@JsonSerializable()
class BuildPersonalizedDigestResponseDto {
  const BuildPersonalizedDigestResponseDto({
    required this.highSignalFeedItemIds,
    required this.interestIds,
    required this.items,
    required this.status,
    required this.userId,
    required this.window,
    this.memoryGuidance,
  });

  factory BuildPersonalizedDigestResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$BuildPersonalizedDigestResponseDtoFromJson(json);

  final List<String> highSignalFeedItemIds;
  final List<String> interestIds;
  final List<RankedFeedItemDto> items;
  final RelevanceMemoryGuidanceDto? memoryGuidance;
  final BuildPersonalizedDigestResponseDtoStatusStatus status;
  final String userId;
  final PersonalizedDigestWindowDto window;

  Map<String, Object?> toJson() =>
      _$BuildPersonalizedDigestResponseDtoToJson(this);
}
