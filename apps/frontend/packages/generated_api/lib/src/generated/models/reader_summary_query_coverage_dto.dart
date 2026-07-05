// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_query_coverage_dto.g.dart';

@JsonSerializable()
class ReaderSummaryQueryCoverageDto {
  const ReaderSummaryQueryCoverageDto({
    required this.collectedFeedItemCount,
    required this.lowRelevanceFeedItemCount,
    required this.mutedFeedItemCount,
    required this.query,
    required this.userRatedFeedItemCount,
  });

  factory ReaderSummaryQueryCoverageDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryQueryCoverageDtoFromJson(json);

  final num collectedFeedItemCount;
  final num lowRelevanceFeedItemCount;
  final num mutedFeedItemCount;
  final String query;
  final num userRatedFeedItemCount;

  Map<String, Object?> toJson() => _$ReaderSummaryQueryCoverageDtoToJson(this);
}
