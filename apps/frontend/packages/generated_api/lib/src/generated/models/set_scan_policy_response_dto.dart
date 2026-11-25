// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_scan_policy_response_dto.g.dart';

@JsonSerializable()
class SetScanPolicyResponseDto {
  const SetScanPolicyResponseDto({
    required this.created,
    required this.scanPolicyId,
    required this.updated,
  });

  factory SetScanPolicyResponseDto.fromJson(Map<String, Object?> json) =>
      _$SetScanPolicyResponseDtoFromJson(json);

  final bool created;
  final String scanPolicyId;
  final bool updated;

  Map<String, Object?> toJson() => _$SetScanPolicyResponseDtoToJson(this);
}
