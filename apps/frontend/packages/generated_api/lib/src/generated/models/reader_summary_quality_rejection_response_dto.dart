// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_period_dto.dart';
import 'reader_summary_quality_rejection_citation_dto.dart';
import 'reader_summary_quality_rejection_response_dto_failure_class_failure_class.dart';
import 'reader_summary_quality_rejection_shadow_dto.dart';
import 'reader_summary_quality_rejection_top_read_dto.dart';
import 'reader_summary_quality_rejection_violation_dto.dart';
import 'reader_summary_scope_dto.dart';

part 'reader_summary_quality_rejection_response_dto.g.dart';

@JsonSerializable()
class ReaderSummaryQualityRejectionResponseDto {
  const ReaderSummaryQualityRejectionResponseDto({
    required this.canonicalScore,
    required this.citations,
    required this.failureClass,
    required this.headline,
    required this.period,
    required this.readerSummaryId,
    required this.readerSummaryJobId,
    required this.reasonCodes,
    required this.reasons,
    required this.scope,
    required this.shadow,
    required this.topReads,
    required this.violations,
  });

  factory ReaderSummaryQualityRejectionResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryQualityRejectionResponseDtoFromJson(json);

  final num canonicalScore;
  final List<ReaderSummaryQualityRejectionCitationDto> citations;
  final ReaderSummaryQualityRejectionResponseDtoFailureClassFailureClass
  failureClass;
  final String headline;
  final ReaderSummaryPeriodDto period;
  final String readerSummaryId;
  final String readerSummaryJobId;
  final List<String> reasonCodes;
  final List<String> reasons;
  final ReaderSummaryScopeDto scope;
  final ReaderSummaryQualityRejectionShadowDto shadow;
  final List<ReaderSummaryQualityRejectionTopReadDto> topReads;
  final List<ReaderSummaryQualityRejectionViolationDto> violations;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryQualityRejectionResponseDtoToJson(this);
}
