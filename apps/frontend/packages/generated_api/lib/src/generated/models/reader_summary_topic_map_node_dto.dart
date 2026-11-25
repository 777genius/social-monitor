// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_topic_map_node_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTopicMapNodeDto {
  const ReaderSummaryTopicMapNodeDto({
    required this.citationIds,
    required this.evidenceCount,
    required this.groupId,
    required this.id,
    required this.interestIds,
    required this.keywords,
    required this.label,
    required this.popularityScore,
    required this.providerKeys,
    required this.rationale,
    required this.sizeWeight,
    required this.storyClusterIds,
  });

  factory ReaderSummaryTopicMapNodeDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryTopicMapNodeDtoFromJson(json);

  final List<String> citationIds;
  final num evidenceCount;
  final String groupId;
  final String id;
  final List<String> interestIds;
  final List<String> keywords;
  final String label;
  final num popularityScore;
  final List<String> providerKeys;
  final String rationale;
  final num sizeWeight;
  final List<String> storyClusterIds;

  Map<String, Object?> toJson() => _$ReaderSummaryTopicMapNodeDtoToJson(this);
}
