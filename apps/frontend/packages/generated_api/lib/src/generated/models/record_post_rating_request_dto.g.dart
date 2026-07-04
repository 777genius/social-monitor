// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_post_rating_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecordPostRatingRequestDto _$RecordPostRatingRequestDtoFromJson(
  Map<String, dynamic> json,
) => RecordPostRatingRequestDto(
  idempotencyKey: json['idempotencyKey'] as String,
  interestId: json['interestId'] as String,
  providerKey: json['providerKey'] as String,
  rating: json['rating'] as num,
  title: json['title'] as String,
  bodyPreview: json['bodyPreview'] as String?,
  canonicalUrl: json['canonicalUrl'] as String?,
  feedItemId: json['feedItemId'] as String?,
  reason: json['reason'] == null
      ? null
      : RecordPostRatingRequestDtoReasonReason.fromJson(
          json['reason'] as String,
        ),
  sourceItemId: json['sourceItemId'] as String?,
);

Map<String, dynamic> _$RecordPostRatingRequestDtoToJson(
  RecordPostRatingRequestDto instance,
) => <String, dynamic>{
  'bodyPreview': instance.bodyPreview,
  'canonicalUrl': instance.canonicalUrl,
  'feedItemId': instance.feedItemId,
  'idempotencyKey': instance.idempotencyKey,
  'interestId': instance.interestId,
  'providerKey': instance.providerKey,
  'rating': instance.rating,
  'reason': instance.reason,
  'sourceItemId': instance.sourceItemId,
  'title': instance.title,
};
