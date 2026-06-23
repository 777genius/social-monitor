// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_freshness_dto_reason_reason.dart';
import 'briefing_freshness_dto_status_status.dart';

part 'briefing_freshness_dto.g.dart';

@JsonSerializable()
class BriefingFreshnessDto {
  const BriefingFreshnessDto({
    required this.checkedAt,
    required this.status,
    this.newestFeedItemId,
    this.newestObservedAt,
    this.reason,
    this.staleMarkedAt,
  });

  factory BriefingFreshnessDto.fromJson(Map<String, Object?> json) =>
      _$BriefingFreshnessDtoFromJson(json);

  final DateTime checkedAt;
  final String? newestFeedItemId;
  final DateTime? newestObservedAt;
  final BriefingFreshnessDtoReasonReason? reason;
  final DateTime? staleMarkedAt;
  final BriefingFreshnessDtoStatusStatus status;

  Map<String, Object?> toJson() => _$BriefingFreshnessDtoToJson(this);
}
