// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'summary_feedback_response_dto.dart';

part 'list_summary_feedback_response_dto.g.dart';

@JsonSerializable()
class ListSummaryFeedbackResponseDto {
  const ListSummaryFeedbackResponseDto({required this.items, this.nextCursor});

  factory ListSummaryFeedbackResponseDto.fromJson(Map<String, Object?> json) =>
      _$ListSummaryFeedbackResponseDtoFromJson(json);

  final List<SummaryFeedbackResponseDto> items;
  final String? nextCursor;

  Map<String, Object?> toJson() => _$ListSummaryFeedbackResponseDtoToJson(this);
}
