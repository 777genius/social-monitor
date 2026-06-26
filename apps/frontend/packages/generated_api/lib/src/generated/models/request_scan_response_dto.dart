// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'request_scan_decision_response_dto.dart';
import 'request_scan_response_dto_status_status.dart';

part 'request_scan_response_dto.g.dart';

@JsonSerializable()
class RequestScanResponseDto {
  const RequestScanResponseDto({
    required this.created,
    required this.requestDecision,
    required this.scanJobId,
    required this.status,
  });

  factory RequestScanResponseDto.fromJson(Map<String, Object?> json) =>
      _$RequestScanResponseDtoFromJson(json);

  final bool created;
  final RequestScanDecisionResponseDto requestDecision;
  final String scanJobId;
  final RequestScanResponseDtoStatusStatus status;

  Map<String, Object?> toJson() => _$RequestScanResponseDtoToJson(this);
}
