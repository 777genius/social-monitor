// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'get_feed_item_response_dto.g.dart';

@JsonSerializable()
class GetFeedItemResponseDto {
  const GetFeedItemResponseDto({
    required this.bodyPreview,
    required this.canonicalUrl,
    required this.id,
    required this.observedAt,
    required this.providerKey,
    required this.publishedAt,
    required this.sourceBindingId,
    required this.sourceItemId,
    required this.title,
    required this.topicId,
    this.authorHandle,
    this.providerMetadata,
  });

  factory GetFeedItemResponseDto.fromJson(Map<String, Object?> json) =>
      _$GetFeedItemResponseDtoFromJson(json);

  final String? authorHandle;
  final String bodyPreview;
  final String canonicalUrl;
  final String id;
  final DateTime observedAt;
  final String providerKey;
  final dynamic providerMetadata;
  final DateTime publishedAt;
  final String sourceBindingId;
  final String sourceItemId;
  final String title;
  final String topicId;

  Map<String, Object?> toJson() => _$GetFeedItemResponseDtoToJson(this);
}
