// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'relevance_feedback_signal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RelevanceFeedbackSignalDto _$RelevanceFeedbackSignalDtoFromJson(
  Map<String, dynamic> json,
) => RelevanceFeedbackSignalDto(
  action: RelevanceFeedbackSignalDtoActionAction.fromJson(
    json['action'] as String,
  ),
  createdAt: DateTime.parse(json['createdAt'] as String),
  feedbackId: json['feedbackId'] as String,
  target: RelevanceFeedbackTargetDto.fromJson(
    json['target'] as Map<String, dynamic>,
  ),
  userId: json['userId'] as String,
  rating: json['rating'] as num?,
);

Map<String, dynamic> _$RelevanceFeedbackSignalDtoToJson(
  RelevanceFeedbackSignalDto instance,
) => <String, dynamic>{
  'action': instance.action,
  'createdAt': instance.createdAt.toIso8601String(),
  'feedbackId': instance.feedbackId,
  'rating': instance.rating,
  'target': instance.target,
  'userId': instance.userId,
};
