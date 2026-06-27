// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_reader_item_dto.dart';

part 'reader_summary_reader_topic_section_dto.g.dart';

@JsonSerializable()
class ReaderSummaryReaderTopicSectionDto {
  const ReaderSummaryReaderTopicSectionDto({
    required this.citationIds,
    required this.insight,
    required this.items,
    required this.title,
    this.topicId,
  });

  factory ReaderSummaryReaderTopicSectionDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryReaderTopicSectionDtoFromJson(json);

  final List<String> citationIds;
  final String insight;
  final List<ReaderSummaryReaderItemDto> items;
  final String title;
  final String? topicId;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryReaderTopicSectionDtoToJson(this);
}
