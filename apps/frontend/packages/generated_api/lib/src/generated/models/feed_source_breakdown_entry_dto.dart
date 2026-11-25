// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_source_breakdown_entry_dto_max_signal_band_max_signal_band.dart';

part 'feed_source_breakdown_entry_dto.g.dart';

@JsonSerializable()
class FeedSourceBreakdownEntryDto {
  const FeedSourceBreakdownEntryDto({
    required this.contentType,
    required this.itemCount,
    required this.providerKey,
    required this.sampleItemIds,
    required this.sourceBindingIds,
    required this.sourceKey,
    this.latestObservedAt,
    this.latestPublishedAt,
    this.maxSignalBand,
    this.maxSignalScore,
  });

  factory FeedSourceBreakdownEntryDto.fromJson(Map<String, Object?> json) =>
      _$FeedSourceBreakdownEntryDtoFromJson(json);

  final String contentType;
  final num itemCount;
  final DateTime? latestObservedAt;
  final DateTime? latestPublishedAt;
  final FeedSourceBreakdownEntryDtoMaxSignalBandMaxSignalBand? maxSignalBand;
  final num? maxSignalScore;
  final String providerKey;
  final List<String> sampleItemIds;
  final List<String> sourceBindingIds;
  final String sourceKey;

  Map<String, Object?> toJson() => _$FeedSourceBreakdownEntryDtoToJson(this);
}
