// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'summary_feedback_evidence_dto.dart';
import 'summary_feedback_response_dto_category_category.dart';
import 'summary_feedback_response_dto_triage_owner_triage_owner.dart';

part 'summary_feedback_response_dto.g.dart';

@JsonSerializable()
class SummaryFeedbackResponseDto {
  const SummaryFeedbackResponseDto({
    required this.category,
    required this.createdAt,
    required this.eligibleForEvalFixture,
    required this.evidence,
    required this.feedbackId,
    required this.interestId,
    required this.rating,
    required this.submittedBy,
    required this.summaryId,
    required this.tenantId,
    required this.triageOwner,
    required this.workspaceId,
    this.comment,
  });

  factory SummaryFeedbackResponseDto.fromJson(Map<String, Object?> json) =>
      _$SummaryFeedbackResponseDtoFromJson(json);

  final SummaryFeedbackResponseDtoCategoryCategory category;
  final String? comment;
  final DateTime createdAt;
  final bool eligibleForEvalFixture;
  final SummaryFeedbackEvidenceDto evidence;
  final String feedbackId;
  final String interestId;
  final num rating;
  final String submittedBy;
  final String summaryId;
  final String tenantId;
  final SummaryFeedbackResponseDtoTriageOwnerTriageOwner triageOwner;
  final String workspaceId;

  Map<String, Object?> toJson() => _$SummaryFeedbackResponseDtoToJson(this);
}
