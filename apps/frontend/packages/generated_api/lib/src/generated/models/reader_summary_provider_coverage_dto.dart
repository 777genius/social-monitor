// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_provider_collection_health_dto.dart';

part 'reader_summary_provider_coverage_dto.g.dart';

@JsonSerializable()
class ReaderSummaryProviderCoverageDto {
  const ReaderSummaryProviderCoverageDto({
    required this.citationCount,
    required this.lowRelevanceFeedItemCount,
    required this.mutedFeedItemCount,
    required this.providerKey,
    required this.selectedFeedItemCount,
    required this.topReadCount,
    required this.userRatedFeedItemCount,
    this.collectedFeedItemCount,
    this.collectionHealth,
  });

  factory ReaderSummaryProviderCoverageDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryProviderCoverageDtoFromJson(json);

  final num citationCount;
  final num? collectedFeedItemCount;
  final ReaderSummaryProviderCollectionHealthDto? collectionHealth;
  final num lowRelevanceFeedItemCount;
  final num mutedFeedItemCount;
  final String providerKey;
  final num selectedFeedItemCount;
  final num topReadCount;
  final num userRatedFeedItemCount;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryProviderCoverageDtoToJson(this);
}
