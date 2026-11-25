// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_summary_feedback_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecordSummaryFeedbackResponseDto _$RecordSummaryFeedbackResponseDtoFromJson(
  Map<String, dynamic> json,
) => RecordSummaryFeedbackResponseDto(
  category: RecordSummaryFeedbackResponseDtoCategoryCategory.fromJson(
    json['category'] as String,
  ),
  created: json['created'] as bool,
  createdAt: DateTime.parse(json['createdAt'] as String),
  eligibleForEvalFixture: json['eligibleForEvalFixture'] as bool,
  evidence: SummaryFeedbackEvidenceDto.fromJson(
    json['evidence'] as Map<String, dynamic>,
  ),
  feedbackId: json['feedbackId'] as String,
  triageOwner: RecordSummaryFeedbackResponseDtoTriageOwnerTriageOwner.fromJson(
    json['triageOwner'] as String,
  ),
);

Map<String, dynamic> _$RecordSummaryFeedbackResponseDtoToJson(
  RecordSummaryFeedbackResponseDto instance,
) => <String, dynamic>{
  'category': instance.category,
  'created': instance.created,
  'createdAt': instance.createdAt.toIso8601String(),
  'eligibleForEvalFixture': instance.eligibleForEvalFixture,
  'evidence': instance.evidence,
  'feedbackId': instance.feedbackId,
  'triageOwner': instance.triageOwner,
};
