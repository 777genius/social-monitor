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
  interestId: json['interestId'] as String,
  observedAt: DateTime.parse(json['observedAt'] as String),
  providerKey: json['providerKey'] as String,
  publishedAt: DateTime.parse(json['publishedAt'] as String),
  sourceBindingId: json['sourceBindingId'] as String,
  sourceItemId: json['sourceItemId'] as String,
  title: json['title'] as String,
  authorHandle: json['authorHandle'] as String?,
  normalizedSignal: json['normalizedSignal'] == null
      ? null
      : FeedNormalizedSignalDto.fromJson(
          json['normalizedSignal'] as Map<String, dynamic>,
        ),
  providerMetadata: json['providerMetadata'],
  providerMetrics: json['providerMetrics'] == null
      ? null
      : GetFeedItemResponseDtoProviderMetricsProviderMetrics.fromJson(
          json['providerMetrics'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$GetFeedItemResponseDtoToJson(
  GetFeedItemResponseDto instance,
) => <String, dynamic>{
  'authorHandle': instance.authorHandle,
  'bodyPreview': instance.bodyPreview,
  'canonicalUrl': instance.canonicalUrl,
  'id': instance.id,
  'interestId': instance.interestId,
  'normalizedSignal': instance.normalizedSignal,
  'observedAt': instance.observedAt.toIso8601String(),
  'providerKey': instance.providerKey,
  'providerMetadata': instance.providerMetadata,
  'providerMetrics': instance.providerMetrics,
  'publishedAt': instance.publishedAt.toIso8601String(),
  'sourceBindingId': instance.sourceBindingId,
  'sourceItemId': instance.sourceItemId,
  'title': instance.title,
};
