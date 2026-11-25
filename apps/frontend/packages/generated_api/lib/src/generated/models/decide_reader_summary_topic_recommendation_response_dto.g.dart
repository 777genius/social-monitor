// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'decide_reader_summary_topic_recommendation_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DecideReaderSummaryTopicRecommendationResponseDto
_$DecideReaderSummaryTopicRecommendationResponseDtoFromJson(
  Map<String, dynamic> json,
) => DecideReaderSummaryTopicRecommendationResponseDto(
  application: ReaderSummaryAcceptedTopicApplicationDto.fromJson(
    json['application'] as Map<String, dynamic>,
  ),
  decisionStatus:
      DecideReaderSummaryTopicRecommendationResponseDtoDecisionStatusDecisionStatus.fromJson(
        json['decisionStatus'] as String,
      ),
  reversion: ReaderSummaryAcceptedTopicReversionDto.fromJson(
    json['reversion'] as Map<String, dynamic>,
  ),
  decision: json['decision'] == null
      ? null
      : ReaderSummaryTopicRecommendationDecisionDto.fromJson(
          json['decision'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$DecideReaderSummaryTopicRecommendationResponseDtoToJson(
  DecideReaderSummaryTopicRecommendationResponseDto instance,
) => <String, dynamic>{
  'application': instance.application,
  'decision': instance.decision,
  'decisionStatus': instance.decisionStatus,
  'reversion': instance.reversion,
};
