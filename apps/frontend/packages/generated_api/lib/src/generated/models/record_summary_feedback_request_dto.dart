// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'record_summary_feedback_request_dto_category_category.dart';

part 'record_summary_feedback_request_dto.g.dart';

@JsonSerializable()
class RecordSummaryFeedbackRequestDto {
  const RecordSummaryFeedbackRequestDto({
    required this.category,
    required this.rating,
    this.citationId,
    this.comment,
  });

  factory RecordSummaryFeedbackRequestDto.fromJson(Map<String, Object?> json) =>
      _$RecordSummaryFeedbackRequestDtoFromJson(json);

  final RecordSummaryFeedbackRequestDtoCategoryCategory category;
  final String? citationId;
  final String? comment;
  final num rating;

  Map<String, Object?> toJson() =>
      _$RecordSummaryFeedbackRequestDtoToJson(this);
}
