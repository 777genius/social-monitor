// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_post_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderPostDto _$ReaderPostDtoFromJson(Map<String, dynamic> json) =>
    ReaderPostDto(
      bodyPreview: json['bodyPreview'] as String,
      canonicalUrl: json['canonicalUrl'] as String,
      engagement: json['engagement'] as num?,
      engagementObservedAt: json['engagementObservedAt'] as String?,
      id: json['id'] as String,
      providerFamily: json['providerFamily'] as String,
      providerKey: json['providerKey'] as String,
      publishedAt: json['publishedAt'] as String,
      relevance: json['relevance'] as String?,
      sourceItemId: json['sourceItemId'] as String,
      title: json['title'] as String,
      usefulness: json['usefulness'] as String?,
      likeCount: json['likeCount'] as num?,
      quotedContext: json['quotedContext'] as String?,
    );

Map<String, dynamic> _$ReaderPostDtoToJson(ReaderPostDto instance) =>
    <String, dynamic>{
      'bodyPreview': instance.bodyPreview,
      'canonicalUrl': instance.canonicalUrl,
      'engagement': instance.engagement,
      'engagementObservedAt': instance.engagementObservedAt,
      'id': instance.id,
      'likeCount': instance.likeCount,
      'providerFamily': instance.providerFamily,
      'providerKey': instance.providerKey,
      'publishedAt': instance.publishedAt,
      'quotedContext': instance.quotedContext,
      'relevance': instance.relevance,
      'sourceItemId': instance.sourceItemId,
      'title': instance.title,
      'usefulness': instance.usefulness,
    };
