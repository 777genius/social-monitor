// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'record_relevance_feedback_request_dto_action_action.dart';
import 'record_relevance_feedback_request_dto_reason_reason.dart';

part 'record_relevance_feedback_request_dto.g.dart';

@JsonSerializable()
class RecordRelevanceFeedbackRequestDto {
  const RecordRelevanceFeedbackRequestDto({
    required this.action,
    required this.idempotencyKey,
    required this.providerKey,
    required this.title,
    required this.topicId,
    this.bodyPreview,
    this.canonicalUrl,
    this.feedItemId,
    this.rating,
    this.reason,
  });

  factory RecordRelevanceFeedbackRequestDto.fromJson(
    Map<String, Object?> json,
  ) => _$RecordRelevanceFeedbackRequestDtoFromJson(json);

  final RecordRelevanceFeedbackRequestDtoActionAction action;
  final String? bodyPreview;
  final String? canonicalUrl;
  final String? feedItemId;
  final String idempotencyKey;
  final String providerKey;
  final num? rating;
  final RecordRelevanceFeedbackRequestDtoReasonReason? reason;
  final String title;
  final String topicId;

  Map<String, Object?> toJson() =>
      _$RecordRelevanceFeedbackRequestDtoToJson(this);
}
