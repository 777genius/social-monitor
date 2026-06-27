// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_context_artifact_dto_freshness_freshness.dart';
import 'reader_summary_period_dto.dart';
import 'reader_summary_scope_dto.dart';

part 'reader_summary_context_artifact_dto.g.dart';

@JsonSerializable()
class ReaderSummaryContextArtifactDto {
  const ReaderSummaryContextArtifactDto({
    required this.artifactId,
    required this.freshness,
    required this.generatedAt,
    required this.period,
    required this.scope,
    required this.summaryText,
  });

  factory ReaderSummaryContextArtifactDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryContextArtifactDtoFromJson(json);

  final String artifactId;
  final ReaderSummaryContextArtifactDtoFreshnessFreshness freshness;
  final DateTime generatedAt;
  final ReaderSummaryPeriodDto period;
  final ReaderSummaryScopeDto scope;
  final String summaryText;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryContextArtifactDtoToJson(this);
}
