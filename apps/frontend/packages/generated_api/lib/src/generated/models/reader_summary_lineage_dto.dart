// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_lineage_dto.g.dart';

@JsonSerializable()
class ReaderSummaryLineageDto {
  const ReaderSummaryLineageDto({
    required this.evalDatasetVersion,
    required this.modelVersion,
    required this.promptVersion,
    required this.providerVersion,
    required this.rulesVersion,
    required this.schemaVersion,
    this.rankingPolicyVersion,
  });

  factory ReaderSummaryLineageDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryLineageDtoFromJson(json);

  final String evalDatasetVersion;
  final String modelVersion;
  final String promptVersion;
  final String providerVersion;
  final String? rankingPolicyVersion;
  final String rulesVersion;
  final String schemaVersion;

  Map<String, Object?> toJson() => _$ReaderSummaryLineageDtoToJson(this);
}
