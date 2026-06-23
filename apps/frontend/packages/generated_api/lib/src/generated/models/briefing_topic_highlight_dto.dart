// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'briefing_topic_highlight_dto.g.dart';

@JsonSerializable()
class BriefingTopicHighlightDto {
  const BriefingTopicHighlightDto({
    required this.citationIds,
    required this.summary,
    required this.title,
    required this.topicId,
  });

  factory BriefingTopicHighlightDto.fromJson(Map<String, Object?> json) =>
      _$BriefingTopicHighlightDtoFromJson(json);

  final List<String> citationIds;
  final String summary;
  final String title;
  final String topicId;

  Map<String, Object?> toJson() => _$BriefingTopicHighlightDtoToJson(this);
}
