// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'regenerate_summary_response_dto_status_status.dart';

part 'regenerate_summary_response_dto.g.dart';

@JsonSerializable()
class RegenerateSummaryResponseDto {
  const RegenerateSummaryResponseDto({
    required this.created,
    required this.status,
    required this.summaryJobId,
  });

  factory RegenerateSummaryResponseDto.fromJson(Map<String, Object?> json) =>
      _$RegenerateSummaryResponseDtoFromJson(json);

  final bool created;
  final RegenerateSummaryResponseDtoStatusStatus status;
  final String summaryJobId;

  Map<String, Object?> toJson() => _$RegenerateSummaryResponseDtoToJson(this);
}
