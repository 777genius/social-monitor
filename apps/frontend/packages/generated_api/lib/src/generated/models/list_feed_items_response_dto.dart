// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_item_dto.dart';

part 'list_feed_items_response_dto.g.dart';

@JsonSerializable()
class ListFeedItemsResponseDto {
  const ListFeedItemsResponseDto({required this.items, this.nextCursor});

  factory ListFeedItemsResponseDto.fromJson(Map<String, Object?> json) =>
      _$ListFeedItemsResponseDtoFromJson(json);

  final List<FeedItemDto> items;
  final String? nextCursor;

  Map<String, Object?> toJson() => _$ListFeedItemsResponseDtoToJson(this);
}
