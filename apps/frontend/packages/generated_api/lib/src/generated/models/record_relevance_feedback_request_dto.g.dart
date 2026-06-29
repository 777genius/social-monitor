// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_relevance_feedback_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecordRelevanceFeedbackRequestDto _$RecordRelevanceFeedbackRequestDtoFromJson(
  Map<String, dynamic> json,
) => RecordRelevanceFeedbackRequestDto(
  action: RecordRelevanceFeedbackRequestDtoActionAction.fromJson(
    json['action'] as String,
  ),
  idempotencyKey: json['idempotencyKey'] as String,
  interestId: json['interestId'] as String,
  providerKey: json['providerKey'] as String,
  title: json['title'] as String,
  bodyPreview: json['bodyPreview'] as String?,
  canonicalUrl: json['canonicalUrl'] as String?,
  feedItemId: json['feedItemId'] as String?,
  rating: json['rating'] as num?,
  reason: json['reason'] == null
      ? null
      : RecordRelevanceFeedbackRequestDtoReasonReason.fromJson(
          json['reason'] as String,
        ),
);

Map<String, dynamic> _$RecordRelevanceFeedbackRequestDtoToJson(
  RecordRelevanceFeedbackRequestDto instance,
) => <String, dynamic>{
  'action': instance.action,
  'bodyPreview': instance.bodyPreview,
  'canonicalUrl': instance.canonicalUrl,
  'feedItemId': instance.feedItemId,
  'idempotencyKey': instance.idempotencyKey,
  'interestId': instance.interestId,
  'providerKey': instance.providerKey,
  'rating': instance.rating,
  'reason': instance.reason,
  'title': instance.title,
};
