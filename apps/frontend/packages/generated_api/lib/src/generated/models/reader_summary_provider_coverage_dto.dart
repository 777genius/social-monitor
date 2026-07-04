// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_provider_coverage_dto.g.dart';

@JsonSerializable()
class ReaderSummaryProviderCoverageDto {
  const ReaderSummaryProviderCoverageDto({
    required this.citationCount,
    required this.providerKey,
    required this.selectedFeedItemCount,
    required this.topReadCount,
    this.collectedFeedItemCount,
  });

  factory ReaderSummaryProviderCoverageDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryProviderCoverageDtoFromJson(json);

  final num citationCount;
  final num? collectedFeedItemCount;
  final String providerKey;
  final num selectedFeedItemCount;
  final num topReadCount;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryProviderCoverageDtoToJson(this);
}
