// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_top_story_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTopStoryDto {
  const ReaderSummaryTopStoryDto({
    required this.citationIds,
    required this.providerKeys,
    required this.storyClusterId,
    required this.summary,
    required this.title,
    required this.topicIds,
  });

  factory ReaderSummaryTopStoryDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryTopStoryDtoFromJson(json);

  final List<String> citationIds;
  final List<String> providerKeys;
  final String storyClusterId;
  final String summary;
  final String title;
  final List<String> topicIds;

  Map<String, Object?> toJson() => _$ReaderSummaryTopStoryDtoToJson(this);
}
