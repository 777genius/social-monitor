// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_scope_dto.dart';
import 'request_reader_summary_period_dto.dart';
import 'request_reader_summary_request_dto_cadence_cadence.dart';

part 'request_reader_summary_request_dto.g.dart';

@JsonSerializable()
class RequestReaderSummaryRequestDto {
  const RequestReaderSummaryRequestDto({
    required this.scope,
    this.cadence,
    this.period,
    this.subscriptionId,
    this.timezone,
    this.userId,
  });

  factory RequestReaderSummaryRequestDto.fromJson(Map<String, Object?> json) =>
      _$RequestReaderSummaryRequestDtoFromJson(json);

  final RequestReaderSummaryRequestDtoCadenceCadence? cadence;
  final RequestReaderSummaryPeriodDto? period;
  final ReaderSummaryScopeDto scope;
  final String? subscriptionId;
  final String? timezone;
  final String? userId;

  Map<String, Object?> toJson() => _$RequestReaderSummaryRequestDtoToJson(this);
}
