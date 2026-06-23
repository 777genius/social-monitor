// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'get_feed_item_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GetFeedItemResponseDto _$GetFeedItemResponseDtoFromJson(
  Map<String, dynamic> json,
) => GetFeedItemResponseDto(
  bodyPreview: json['bodyPreview'] as String,
  canonicalUrl: json['canonicalUrl'] as String,
  id: json['id'] as String,
  observedAt: DateTime.parse(json['observedAt'] as String),
  providerKey: json['providerKey'] as String,
  publishedAt: DateTime.parse(json['publishedAt'] as String),
  sourceBindingId: json['sourceBindingId'] as String,
  sourceItemId: json['sourceItemId'] as String,
  title: json['title'] as String,
  topicId: json['topicId'] as String,
  authorHandle: json['authorHandle'] as String?,
  providerMetadata: json['providerMetadata'],
);

Map<String, dynamic> _$GetFeedItemResponseDtoToJson(
  GetFeedItemResponseDto instance,
) => <String, dynamic>{
  'authorHandle': instance.authorHandle,
  'bodyPreview': instance.bodyPreview,
  'canonicalUrl': instance.canonicalUrl,
  'id': instance.id,
  'observedAt': instance.observedAt.toIso8601String(),
  'providerKey': instance.providerKey,
  'providerMetadata': instance.providerMetadata,
  'publishedAt': instance.publishedAt.toIso8601String(),
  'sourceBindingId': instance.sourceBindingId,
  'sourceItemId': instance.sourceItemId,
  'title': instance.title,
  'topicId': instance.topicId,
};
