// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'get_scan_policy_response_dto.g.dart';

@JsonSerializable()
class GetScanPolicyResponseDto {
  const GetScanPolicyResponseDto({
    required this.createdAt,
    required this.freshnessSeconds,
    required this.id,
    required this.intervalSeconds,
    required this.nextRunAt,
    required this.retryBudget,
    required this.sourceBindingId,
    required this.tenantId,
    required this.workspaceId,
  });

  factory GetScanPolicyResponseDto.fromJson(Map<String, Object?> json) =>
      _$GetScanPolicyResponseDtoFromJson(json);

  final DateTime createdAt;
  final num freshnessSeconds;
  final String id;
  final num intervalSeconds;
  final DateTime nextRunAt;
  final num retryBudget;
  final String sourceBindingId;
  final dynamic tenantId;
  final dynamic workspaceId;

  Map<String, Object?> toJson() => _$GetScanPolicyResponseDtoToJson(this);
}
