// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_freshness_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingFreshnessDto _$BriefingFreshnessDtoFromJson(
  Map<String, dynamic> json,
) => BriefingFreshnessDto(
  checkedAt: DateTime.parse(json['checkedAt'] as String),
  status: BriefingFreshnessDtoStatusStatus.fromJson(json['status'] as String),
  newestFeedItemId: json['newestFeedItemId'] as String?,
  newestObservedAt: json['newestObservedAt'] == null
      ? null
      : DateTime.parse(json['newestObservedAt'] as String),
  reason: json['reason'] == null
      ? null
      : BriefingFreshnessDtoReasonReason.fromJson(json['reason'] as String),
  staleMarkedAt: json['staleMarkedAt'] == null
      ? null
      : DateTime.parse(json['staleMarkedAt'] as String),
);

Map<String, dynamic> _$BriefingFreshnessDtoToJson(
  BriefingFreshnessDto instance,
) => <String, dynamic>{
  'checkedAt': instance.checkedAt.toIso8601String(),
  'newestFeedItemId': instance.newestFeedItemId,
  'newestObservedAt': instance.newestObservedAt?.toIso8601String(),
  'reason': instance.reason,
  'staleMarkedAt': instance.staleMarkedAt?.toIso8601String(),
  'status': instance.status,
};
