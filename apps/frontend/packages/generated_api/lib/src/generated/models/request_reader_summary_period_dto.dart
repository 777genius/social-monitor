// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'request_reader_summary_period_dto.g.dart';

@JsonSerializable()
class RequestReaderSummaryPeriodDto {
  const RequestReaderSummaryPeriodDto({
    required this.endedAt,
    required this.startedAt,
    required this.timezone,
  });

  factory RequestReaderSummaryPeriodDto.fromJson(Map<String, Object?> json) =>
      _$RequestReaderSummaryPeriodDtoFromJson(json);

  final DateTime endedAt;
  final DateTime startedAt;
  final String timezone;

  Map<String, Object?> toJson() => _$RequestReaderSummaryPeriodDtoToJson(this);
}
