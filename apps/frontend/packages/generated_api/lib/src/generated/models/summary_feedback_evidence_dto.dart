// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'summary_feedback_evidence_dto.g.dart';

@JsonSerializable()
class SummaryFeedbackEvidenceDto {
  const SummaryFeedbackEvidenceDto({
    required this.interestId,
    required this.summaryId,
    this.citationId,
    this.feedItemId,
    this.providerKey,
    this.sourceItemId,
  });

  factory SummaryFeedbackEvidenceDto.fromJson(Map<String, Object?> json) =>
      _$SummaryFeedbackEvidenceDtoFromJson(json);

  final String? citationId;
  final String? feedItemId;
  final String interestId;
  final String? providerKey;
  final String? sourceItemId;
  final String summaryId;

  Map<String, Object?> toJson() => _$SummaryFeedbackEvidenceDtoToJson(this);
}
