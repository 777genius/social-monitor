// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feed_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeedItemDto _$FeedItemDtoFromJson(Map<String, dynamic> json) => FeedItemDto(
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
  normalizedSignal: json['normalizedSignal'] == null
      ? null
      : FeedNormalizedSignalDto.fromJson(
          json['normalizedSignal'] as Map<String, dynamic>,
        ),
  providerMetadata: json['providerMetadata'],
  providerMetrics: json['providerMetrics'] == null
      ? null
      : FeedItemDtoProviderMetricsProviderMetrics.fromJson(
          json['providerMetrics'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$FeedItemDtoToJson(FeedItemDto instance) =>
    <String, dynamic>{
      'authorHandle': instance.authorHandle,
      'bodyPreview': instance.bodyPreview,
      'canonicalUrl': instance.canonicalUrl,
      'id': instance.id,
      'normalizedSignal': instance.normalizedSignal,
      'observedAt': instance.observedAt.toIso8601String(),
      'providerKey': instance.providerKey,
      'providerMetadata': instance.providerMetadata,
      'providerMetrics': instance.providerMetrics,
      'publishedAt': instance.publishedAt.toIso8601String(),
      'sourceBindingId': instance.sourceBindingId,
      'sourceItemId': instance.sourceItemId,
      'title': instance.title,
      'topicId': instance.topicId,
    };
