// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'source_binding_health_policy_response_dto.g.dart';

@JsonSerializable()
class SourceBindingHealthPolicyResponseDto {
  const SourceBindingHealthPolicyResponseDto({
    required this.createdAt,
    required this.freshnessSeconds,
    required this.id,
    required this.intervalSeconds,
    required this.isDue,
    required this.nextRunAt,
    required this.retryBudget,
    required this.sourceBindingId,
    required this.tenantId,
    required this.workspaceId,
  });

  factory SourceBindingHealthPolicyResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingHealthPolicyResponseDtoFromJson(json);

  final DateTime createdAt;
  final num freshnessSeconds;
  final String id;
  final num intervalSeconds;
  final bool isDue;
  final DateTime nextRunAt;
  final num retryBudget;
  final String sourceBindingId;
  final dynamic tenantId;
  final dynamic workspaceId;

  Map<String, Object?> toJson() =>
      _$SourceBindingHealthPolicyResponseDtoToJson(this);
}
