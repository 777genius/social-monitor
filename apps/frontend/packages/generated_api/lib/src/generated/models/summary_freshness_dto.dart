// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'summary_freshness_dto_reason_reason.dart';
import 'summary_freshness_dto_status_status.dart';

part 'summary_freshness_dto.g.dart';

@JsonSerializable()
class SummaryFreshnessDto {
  const SummaryFreshnessDto({
    required this.checkedAt,
    required this.status,
    this.newestFeedItemId,
    this.newestObservedAt,
    this.reason,
    this.staleMarkedAt,
  });

  factory SummaryFreshnessDto.fromJson(Map<String, Object?> json) =>
      _$SummaryFreshnessDtoFromJson(json);

  final DateTime checkedAt;
  final String? newestFeedItemId;
  final DateTime? newestObservedAt;
  final SummaryFreshnessDtoReasonReason? reason;
  final DateTime? staleMarkedAt;
  final SummaryFreshnessDtoStatusStatus status;

  Map<String, Object?> toJson() => _$SummaryFreshnessDtoToJson(this);
}
