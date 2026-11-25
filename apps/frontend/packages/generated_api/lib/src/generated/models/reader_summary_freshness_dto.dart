// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_freshness_dto_reason_reason.dart';
import 'reader_summary_freshness_dto_status_status.dart';

part 'reader_summary_freshness_dto.g.dart';

@JsonSerializable()
class ReaderSummaryFreshnessDto {
  const ReaderSummaryFreshnessDto({
    required this.checkedAt,
    required this.status,
    this.newestFeedItemId,
    this.newestObservedAt,
    this.reason,
    this.staleMarkedAt,
  });

  factory ReaderSummaryFreshnessDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryFreshnessDtoFromJson(json);

  final DateTime checkedAt;
  final String? newestFeedItemId;
  final DateTime? newestObservedAt;
  final ReaderSummaryFreshnessDtoReasonReason? reason;
  final DateTime? staleMarkedAt;
  final ReaderSummaryFreshnessDtoStatusStatus status;

  Map<String, Object?> toJson() => _$ReaderSummaryFreshnessDtoToJson(this);
}
