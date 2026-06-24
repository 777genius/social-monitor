// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rank_feed_items_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RankFeedItemsResponseDto _$RankFeedItemsResponseDtoFromJson(
  Map<String, dynamic> json,
) => RankFeedItemsResponseDto(
  generatedAt: DateTime.parse(json['generatedAt'] as String),
  items: (json['items'] as List<dynamic>)
      .map((e) => RankedFeedItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  profileApplied: json['profileApplied'] as bool,
  profile: json['profile'] == null
      ? null
      : UserRelevanceProfileDto.fromJson(
          json['profile'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$RankFeedItemsResponseDtoToJson(
  RankFeedItemsResponseDto instance,
) => <String, dynamic>{
  'generatedAt': instance.generatedAt.toIso8601String(),
  'items': instance.items,
  'profile': instance.profile,
  'profileApplied': instance.profileApplied,
};
