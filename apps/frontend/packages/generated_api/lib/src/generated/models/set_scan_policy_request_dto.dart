// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_scan_policy_request_dto.g.dart';

@JsonSerializable()
class SetScanPolicyRequestDto {
  const SetScanPolicyRequestDto({
    required this.freshnessSeconds,
    required this.intervalSeconds,
    required this.retryBudget,
  });

  factory SetScanPolicyRequestDto.fromJson(Map<String, Object?> json) =>
      _$SetScanPolicyRequestDtoFromJson(json);

  final num freshnessSeconds;
  final num intervalSeconds;
  final num retryBudget;

  Map<String, Object?> toJson() => _$SetScanPolicyRequestDtoToJson(this);
}
