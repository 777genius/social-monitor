// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_provider_collection_health_dto_state_state.dart';

part 'reader_summary_provider_collection_health_dto.g.dart';

@JsonSerializable()
class ReaderSummaryProviderCollectionHealthDto {
  const ReaderSummaryProviderCollectionHealthDto({
    required this.acceptedItemCount,
    required this.collectedItemCount,
    required this.failureKinds,
    required this.insertedItemCount,
    required this.outsideWindowItemCount,
    required this.pageCount,
    required this.paginationDuplicateItemCount,
    required this.paginationStopReasons,
    required this.rateLimitEventCount,
    required this.scanCount,
    required this.state,
    required this.storageDuplicateItemCount,
    this.newestAcceptedPublishedAt,
    this.oldestAcceptedPublishedAt,
    this.targetItemCount,
  });

  factory ReaderSummaryProviderCollectionHealthDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryProviderCollectionHealthDtoFromJson(json);

  final num acceptedItemCount;
  final num collectedItemCount;
  final List<String> failureKinds;
  final num insertedItemCount;
  final DateTime? newestAcceptedPublishedAt;
  final DateTime? oldestAcceptedPublishedAt;
  final num outsideWindowItemCount;
  final num pageCount;
  final num paginationDuplicateItemCount;
  final List<String> paginationStopReasons;
  final num rateLimitEventCount;
  final num scanCount;
  final ReaderSummaryProviderCollectionHealthDtoStateState state;
  final num storageDuplicateItemCount;
  final num? targetItemCount;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryProviderCollectionHealthDtoToJson(this);
}
