// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_period_dto.dart';
import 'reader_summary_period_summary_dto_status_status.dart';
import 'reader_summary_scope_dto.dart';

part 'reader_summary_period_summary_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPeriodSummaryDto {
  const ReaderSummaryPeriodSummaryDto({
    required this.headline,
    required this.period,
    required this.readerSummaryId,
    required this.scope,
    required this.status,
    required this.tenantId,
    required this.workspaceId,
    this.subscriptionId,
    this.userId,
  });

  factory ReaderSummaryPeriodSummaryDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryPeriodSummaryDtoFromJson(json);

  final String headline;
  final ReaderSummaryPeriodDto period;
  final String readerSummaryId;
  final ReaderSummaryScopeDto scope;
  final ReaderSummaryPeriodSummaryDtoStatusStatus status;
  final String? subscriptionId;
  final String tenantId;
  final String? userId;
  final String workspaceId;

  Map<String, Object?> toJson() => _$ReaderSummaryPeriodSummaryDtoToJson(this);
}
