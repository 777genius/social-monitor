// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'record_summary_feedback_response_dto_category_category.dart';
import 'record_summary_feedback_response_dto_triage_owner_triage_owner.dart';
import 'summary_feedback_evidence_dto.dart';

part 'record_summary_feedback_response_dto.g.dart';

@JsonSerializable()
class RecordSummaryFeedbackResponseDto {
  const RecordSummaryFeedbackResponseDto({
    required this.category,
    required this.created,
    required this.createdAt,
    required this.eligibleForEvalFixture,
    required this.evidence,
    required this.feedbackId,
    required this.triageOwner,
  });

  factory RecordSummaryFeedbackResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$RecordSummaryFeedbackResponseDtoFromJson(json);

  final RecordSummaryFeedbackResponseDtoCategoryCategory category;
  final bool created;
  final DateTime createdAt;
  final bool eligibleForEvalFixture;
  final SummaryFeedbackEvidenceDto evidence;
  final String feedbackId;
  final RecordSummaryFeedbackResponseDtoTriageOwnerTriageOwner triageOwner;

  Map<String, Object?> toJson() =>
      _$RecordSummaryFeedbackResponseDtoToJson(this);
}
