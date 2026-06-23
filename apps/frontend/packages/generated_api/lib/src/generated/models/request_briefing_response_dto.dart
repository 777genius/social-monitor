// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'request_briefing_response_dto_status_status.dart';

part 'request_briefing_response_dto.g.dart';

@JsonSerializable()
class RequestBriefingResponseDto {
  const RequestBriefingResponseDto({
    required this.briefingJobId,
    required this.created,
    required this.status,
  });

  factory RequestBriefingResponseDto.fromJson(Map<String, Object?> json) =>
      _$RequestBriefingResponseDtoFromJson(json);

  final String briefingJobId;
  final bool created;
  final RequestBriefingResponseDtoStatusStatus status;

  Map<String, Object?> toJson() => _$RequestBriefingResponseDtoToJson(this);
}
