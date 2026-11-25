// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ranked_feed_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RankedFeedItemDto _$RankedFeedItemDtoFromJson(Map<String, dynamic> json) =>
    RankedFeedItemDto(
      canonicalUrl: json['canonicalUrl'] as String,
      clusterId: json['clusterId'] as String,
      clusterSize: json['clusterSize'] as num,
      duplicateFeedItemIds: (json['duplicateFeedItemIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      feedItemId: json['feedItemId'] as String,
      interestId: json['interestId'] as String,
      observedAt: DateTime.parse(json['observedAt'] as String),
      providerKey: json['providerKey'] as String,
      publishedAt: DateTime.parse(json['publishedAt'] as String),
      rank: json['rank'] as num,
      safety: SourceContentSafetyDto.fromJson(
        json['safety'] as Map<String, dynamic>,
      ),
      score: json['score'] as num,
      sourceBindingId: json['sourceBindingId'] as String,
      sourceItemId: json['sourceItemId'] as String,
      title: json['title'] as String,
      whyImportant: (json['whyImportant'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      authorHandle: json['authorHandle'] as String?,
      bodyPreview: json['bodyPreview'] as String?,
      providerMetadata: json['providerMetadata'],
    );

Map<String, dynamic> _$RankedFeedItemDtoToJson(RankedFeedItemDto instance) =>
    <String, dynamic>{
      'authorHandle': instance.authorHandle,
      'bodyPreview': instance.bodyPreview,
      'canonicalUrl': instance.canonicalUrl,
      'clusterId': instance.clusterId,
      'clusterSize': instance.clusterSize,
      'duplicateFeedItemIds': instance.duplicateFeedItemIds,
      'feedItemId': instance.feedItemId,
      'interestId': instance.interestId,
      'observedAt': instance.observedAt.toIso8601String(),
      'providerKey': instance.providerKey,
      'providerMetadata': instance.providerMetadata,
      'publishedAt': instance.publishedAt.toIso8601String(),
      'rank': instance.rank,
      'safety': instance.safety,
      'score': instance.score,
      'sourceBindingId': instance.sourceBindingId,
      'sourceItemId': instance.sourceItemId,
      'title': instance.title,
      'whyImportant': instance.whyImportant,
    };
