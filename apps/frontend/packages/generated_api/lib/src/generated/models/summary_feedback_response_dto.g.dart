// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'summary_feedback_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SummaryFeedbackResponseDto _$SummaryFeedbackResponseDtoFromJson(
  Map<String, dynamic> json,
) => SummaryFeedbackResponseDto(
  category: SummaryFeedbackResponseDtoCategoryCategory.fromJson(
    json['category'] as String,
  ),
  createdAt: DateTime.parse(json['createdAt'] as String),
  eligibleForEvalFixture: json['eligibleForEvalFixture'] as bool,
  evidence: SummaryFeedbackEvidenceDto.fromJson(
    json['evidence'] as Map<String, dynamic>,
  ),
  feedbackId: json['feedbackId'] as String,
  interestId: json['interestId'] as String,
  rating: json['rating'] as num,
  submittedBy: json['submittedBy'] as String,
  summaryId: json['summaryId'] as String,
  tenantId: json['tenantId'] as String,
  triageOwner: SummaryFeedbackResponseDtoTriageOwnerTriageOwner.fromJson(
    json['triageOwner'] as String,
  ),
  workspaceId: json['workspaceId'] as String,
  comment: json['comment'] as String?,
);

Map<String, dynamic> _$SummaryFeedbackResponseDtoToJson(
  SummaryFeedbackResponseDto instance,
) => <String, dynamic>{
  'category': instance.category,
  'comment': instance.comment,
  'createdAt': instance.createdAt.toIso8601String(),
  'eligibleForEvalFixture': instance.eligibleForEvalFixture,
  'evidence': instance.evidence,
  'feedbackId': instance.feedbackId,
  'interestId': instance.interestId,
  'rating': instance.rating,
  'submittedBy': instance.submittedBy,
  'summaryId': instance.summaryId,
  'tenantId': instance.tenantId,
  'triageOwner': instance.triageOwner,
  'workspaceId': instance.workspaceId,
};
