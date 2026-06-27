// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_freshness_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryFreshnessDto _$ReaderSummaryFreshnessDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryFreshnessDto(
  checkedAt: DateTime.parse(json['checkedAt'] as String),
  status: ReaderSummaryFreshnessDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  newestFeedItemId: json['newestFeedItemId'] as String?,
  newestObservedAt: json['newestObservedAt'] == null
      ? null
      : DateTime.parse(json['newestObservedAt'] as String),
  reason: json['reason'] == null
      ? null
      : ReaderSummaryFreshnessDtoReasonReason.fromJson(
          json['reason'] as String,
        ),
  staleMarkedAt: json['staleMarkedAt'] == null
      ? null
      : DateTime.parse(json['staleMarkedAt'] as String),
);

Map<String, dynamic> _$ReaderSummaryFreshnessDtoToJson(
  ReaderSummaryFreshnessDto instance,
) => <String, dynamic>{
  'checkedAt': instance.checkedAt.toIso8601String(),
  'newestFeedItemId': instance.newestFeedItemId,
  'newestObservedAt': instance.newestObservedAt?.toIso8601String(),
  'reason': instance.reason,
  'staleMarkedAt': instance.staleMarkedAt?.toIso8601String(),
  'status': instance.status,
};
