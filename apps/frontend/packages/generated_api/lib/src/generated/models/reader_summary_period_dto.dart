// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_period_dto_cadence_cadence.dart';

part 'reader_summary_period_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPeriodDto {
  const ReaderSummaryPeriodDto({
    required this.cadence,
    required this.endedAt,
    required this.periodKey,
    required this.startedAt,
    required this.timezone,
  });

  factory ReaderSummaryPeriodDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryPeriodDtoFromJson(json);

  final ReaderSummaryPeriodDtoCadenceCadence cadence;
  final DateTime endedAt;
  final String periodKey;
  final DateTime startedAt;
  final String timezone;

  Map<String, Object?> toJson() => _$ReaderSummaryPeriodDtoToJson(this);
}
