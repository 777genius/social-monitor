// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_topic_coverage_dto.g.dart';

@JsonSerializable()
class ReaderSummaryTopicCoverageDto {
  const ReaderSummaryTopicCoverageDto({
    required this.collectedFeedItemCount,
    required this.lowRelevanceFeedItemCount,
    required this.mutedFeedItemCount,
    required this.topicKey,
    required this.userRatedFeedItemCount,
    this.topicLabel,
  });

  factory ReaderSummaryTopicCoverageDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryTopicCoverageDtoFromJson(json);

  final num collectedFeedItemCount;
  final num lowRelevanceFeedItemCount;
  final num mutedFeedItemCount;
  final String topicKey;
  final String? topicLabel;
  final num userRatedFeedItemCount;

  Map<String, Object?> toJson() => _$ReaderSummaryTopicCoverageDtoToJson(this);
}
