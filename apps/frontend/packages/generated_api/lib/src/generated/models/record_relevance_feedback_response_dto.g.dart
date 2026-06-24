// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_relevance_feedback_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecordRelevanceFeedbackResponseDto _$RecordRelevanceFeedbackResponseDtoFromJson(
  Map<String, dynamic> json,
) => RecordRelevanceFeedbackResponseDto(
  created: json['created'] as bool,
  feedback: RelevanceFeedbackSignalDto.fromJson(
    json['feedback'] as Map<String, dynamic>,
  ),
  learningDirection:
      RecordRelevanceFeedbackResponseDtoLearningDirectionLearningDirection.fromJson(
        json['learningDirection'] as String,
      ),
  profile: UserRelevanceProfileDto.fromJson(
    json['profile'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$RecordRelevanceFeedbackResponseDtoToJson(
  RecordRelevanceFeedbackResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'feedback': instance.feedback,
  'learningDirection': instance.learningDirection,
  'profile': instance.profile,
};
