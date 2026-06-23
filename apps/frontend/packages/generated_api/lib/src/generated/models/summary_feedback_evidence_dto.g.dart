// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'summary_feedback_evidence_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SummaryFeedbackEvidenceDto _$SummaryFeedbackEvidenceDtoFromJson(
  Map<String, dynamic> json,
) => SummaryFeedbackEvidenceDto(
  summaryId: json['summaryId'] as String,
  topicId: json['topicId'] as String,
  citationId: json['citationId'] as String?,
  feedItemId: json['feedItemId'] as String?,
  providerKey: json['providerKey'] as String?,
  sourceItemId: json['sourceItemId'] as String?,
);

Map<String, dynamic> _$SummaryFeedbackEvidenceDtoToJson(
  SummaryFeedbackEvidenceDto instance,
) => <String, dynamic>{
  'citationId': instance.citationId,
  'feedItemId': instance.feedItemId,
  'providerKey': instance.providerKey,
  'sourceItemId': instance.sourceItemId,
  'summaryId': instance.summaryId,
  'topicId': instance.topicId,
};
