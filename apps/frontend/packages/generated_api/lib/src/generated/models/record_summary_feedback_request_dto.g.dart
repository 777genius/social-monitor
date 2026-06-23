// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_summary_feedback_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecordSummaryFeedbackRequestDto _$RecordSummaryFeedbackRequestDtoFromJson(
  Map<String, dynamic> json,
) => RecordSummaryFeedbackRequestDto(
  category: RecordSummaryFeedbackRequestDtoCategoryCategory.fromJson(
    json['category'] as String,
  ),
  rating: json['rating'] as num,
  citationId: json['citationId'] as String?,
  comment: json['comment'] as String?,
);

Map<String, dynamic> _$RecordSummaryFeedbackRequestDtoToJson(
  RecordSummaryFeedbackRequestDto instance,
) => <String, dynamic>{
  'category': instance.category,
  'citationId': instance.citationId,
  'comment': instance.comment,
  'rating': instance.rating,
};
