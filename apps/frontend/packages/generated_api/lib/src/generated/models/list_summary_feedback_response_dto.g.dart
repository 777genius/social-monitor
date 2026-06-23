// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_summary_feedback_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListSummaryFeedbackResponseDto _$ListSummaryFeedbackResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListSummaryFeedbackResponseDto(
  items: (json['items'] as List<dynamic>)
      .map(
        (e) => SummaryFeedbackResponseDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$ListSummaryFeedbackResponseDtoToJson(
  ListSummaryFeedbackResponseDto instance,
) => <String, dynamic>{
  'items': instance.items,
  'nextCursor': instance.nextCursor,
};
