// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'x_post_provider_metrics_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

XPostProviderMetricsDto _$XPostProviderMetricsDtoFromJson(
  Map<String, dynamic> json,
) => XPostProviderMetricsDto(
  bookmarks: json['bookmarks'] as num,
  contentType: XPostProviderMetricsDtoContentTypeContentType.fromJson(
    json['contentType'] as String,
  ),
  impressions: json['impressions'] as num,
  kind: XPostProviderMetricsDtoKindKind.fromJson(json['kind'] as String),
  likes: json['likes'] as num,
  providerKey: XPostProviderMetricsDtoProviderKeyProviderKey.fromJson(
    json['providerKey'] as String,
  ),
  quotes: json['quotes'] as num,
  replies: json['replies'] as num,
  reposts: json['reposts'] as num,
  sourceKey: json['sourceKey'] as String,
);

Map<String, dynamic> _$XPostProviderMetricsDtoToJson(
  XPostProviderMetricsDto instance,
) => <String, dynamic>{
  'bookmarks': instance.bookmarks,
  'contentType': instance.contentType,
  'impressions': instance.impressions,
  'kind': instance.kind,
  'likes': instance.likes,
  'providerKey': instance.providerKey,
  'quotes': instance.quotes,
  'replies': instance.replies,
  'reposts': instance.reposts,
  'sourceKey': instance.sourceKey,
};
