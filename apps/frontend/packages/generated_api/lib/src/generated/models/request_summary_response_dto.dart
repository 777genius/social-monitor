// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'request_summary_response_dto_status_status.dart';

part 'request_summary_response_dto.g.dart';

@JsonSerializable()
class RequestSummaryResponseDto {
  const RequestSummaryResponseDto({
    required this.created,
    required this.status,
    required this.summaryJobId,
  });

  factory RequestSummaryResponseDto.fromJson(Map<String, Object?> json) =>
      _$RequestSummaryResponseDtoFromJson(json);

  final bool created;
  final RequestSummaryResponseDtoStatusStatus status;
  final String summaryJobId;

  Map<String, Object?> toJson() => _$RequestSummaryResponseDtoToJson(this);
}
