// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_topic_highlight_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTopicHighlightDto {
  const ReaderSummaryTopicHighlightDto({
    required this.citationIds,
    required this.summary,
    required this.title,
    required this.topicId,
  });

  factory ReaderSummaryTopicHighlightDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryTopicHighlightDtoFromJson(json);

  final List<String> citationIds;
  final String summary;
  final String title;
  final String topicId;

  Map<String, Object?> toJson() => _$ReaderSummaryTopicHighlightDtoToJson(this);
}
