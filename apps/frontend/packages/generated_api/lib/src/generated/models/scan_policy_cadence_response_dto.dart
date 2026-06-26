// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'scan_policy_cadence_response_dto.g.dart';

@JsonSerializable()
class ScanPolicyCadenceResponseDto {
  const ScanPolicyCadenceResponseDto({
    required this.configuredFreshnessSeconds,
    required this.configuredIntervalSeconds,
    required this.effectiveFreshnessSeconds,
    required this.effectiveIntervalSeconds,
    required this.minimumIntervalSeconds,
    required this.providerKey,
    required this.providerMinimumIntervalEnforced,
  });

  factory ScanPolicyCadenceResponseDto.fromJson(Map<String, Object?> json) =>
      _$ScanPolicyCadenceResponseDtoFromJson(json);

  final num configuredFreshnessSeconds;
  final num configuredIntervalSeconds;
  final num effectiveFreshnessSeconds;
  final num effectiveIntervalSeconds;
  final num minimumIntervalSeconds;
  final String providerKey;
  final bool providerMinimumIntervalEnforced;

  Map<String, Object?> toJson() => _$ScanPolicyCadenceResponseDtoToJson(this);
}
