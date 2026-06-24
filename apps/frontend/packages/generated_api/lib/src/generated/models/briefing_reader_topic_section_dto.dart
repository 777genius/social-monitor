// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_reader_item_dto.dart';

part 'briefing_reader_topic_section_dto.g.dart';

@JsonSerializable()
class BriefingReaderTopicSectionDto {
  const BriefingReaderTopicSectionDto({
    required this.citationIds,
    required this.insight,
    required this.items,
    required this.title,
    this.topicId,
  });

  factory BriefingReaderTopicSectionDto.fromJson(Map<String, Object?> json) =>
      _$BriefingReaderTopicSectionDtoFromJson(json);

  final List<String> citationIds;
  final String insight;
  final List<BriefingReaderItemDto> items;
  final String title;
  final String? topicId;

  Map<String, Object?> toJson() => _$BriefingReaderTopicSectionDtoToJson(this);
}
