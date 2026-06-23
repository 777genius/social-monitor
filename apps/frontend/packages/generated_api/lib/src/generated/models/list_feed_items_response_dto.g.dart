// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_feed_items_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListFeedItemsResponseDto _$ListFeedItemsResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListFeedItemsResponseDto(
  items: (json['items'] as List<dynamic>)
      .map((e) => FeedItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$ListFeedItemsResponseDtoToJson(
  ListFeedItemsResponseDto instance,
) => <String, dynamic>{
  'items': instance.items,
  'nextCursor': instance.nextCursor,
};
