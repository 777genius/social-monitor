// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'interest_source_daily_history_cadence_summary_response_dto.g.dart';

@JsonSerializable()
class InterestSourceDailyHistoryCadenceSummaryResponseDto {
  const InterestSourceDailyHistoryCadenceSummaryResponseDto({
    required this.maxConfiguredIntervalSeconds,
    required this.maxEffectiveFreshnessSeconds,
    required this.maxEffectiveIntervalSeconds,
    required this.minConfiguredIntervalSeconds,
    required this.minEffectiveFreshnessSeconds,
    required this.minEffectiveIntervalSeconds,
    required this.minimumIntervalSeconds,
    required this.providerMinimumIntervalEnforced,
    required this.sourceBindingCount,
  });

  factory InterestSourceDailyHistoryCadenceSummaryResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$InterestSourceDailyHistoryCadenceSummaryResponseDtoFromJson(json);

  final num maxConfiguredIntervalSeconds;
  final num maxEffectiveFreshnessSeconds;
  final num maxEffectiveIntervalSeconds;
  final num minConfiguredIntervalSeconds;
  final num minEffectiveFreshnessSeconds;
  final num minEffectiveIntervalSeconds;
  final num minimumIntervalSeconds;
  final bool providerMinimumIntervalEnforced;
  final num sourceBindingCount;

  Map<String, Object?> toJson() =>
      _$InterestSourceDailyHistoryCadenceSummaryResponseDtoToJson(this);
}
