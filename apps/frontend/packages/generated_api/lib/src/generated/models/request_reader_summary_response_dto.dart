// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_period_dto.dart';
import 'request_reader_summary_response_dto_status_status.dart';

part 'request_reader_summary_response_dto.g.dart';

@JsonSerializable()
class RequestReaderSummaryResponseDto {
  const RequestReaderSummaryResponseDto({
    required this.created,
    required this.period,
    required this.readerSummaryJobId,
    required this.status,
  });

  factory RequestReaderSummaryResponseDto.fromJson(Map<String, Object?> json) =>
      _$RequestReaderSummaryResponseDtoFromJson(json);

  final bool created;
  final ReaderSummaryPeriodDto period;
  final String readerSummaryJobId;
  final RequestReaderSummaryResponseDtoStatusStatus status;

  Map<String, Object?> toJson() =>
      _$RequestReaderSummaryResponseDtoToJson(this);
}
