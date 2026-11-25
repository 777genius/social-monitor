// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scan_execution_attempt_response_dto_status_status.dart';

part 'scan_execution_attempt_response_dto.g.dart';

@JsonSerializable()
class ScanExecutionAttemptResponseDto {
  const ScanExecutionAttemptResponseDto({
    required this.fetched,
    required this.inserted,
    required this.projected,
    required this.skippedDuplicates,
    required this.sourceBindingId,
    required this.startedAt,
    required this.status,
    this.failureReason,
    this.finishedAt,
  });

  factory ScanExecutionAttemptResponseDto.fromJson(Map<String, Object?> json) =>
      _$ScanExecutionAttemptResponseDtoFromJson(json);

  final String? failureReason;
  final num fetched;
  final DateTime? finishedAt;
  final num inserted;
  final num projected;
  final num skippedDuplicates;
  final String sourceBindingId;
  final DateTime startedAt;
  final ScanExecutionAttemptResponseDtoStatusStatus status;

  Map<String, Object?> toJson() =>
      _$ScanExecutionAttemptResponseDtoToJson(this);
}
