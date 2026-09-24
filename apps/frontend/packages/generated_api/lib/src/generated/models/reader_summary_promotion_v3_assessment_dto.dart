// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_promotion_v3_assessment_dto_schema_version_schema_version.dart';

part 'reader_summary_promotion_v3_assessment_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPromotionV3AssessmentDto {
  const ReaderSummaryPromotionV3AssessmentDto({
    required this.answers,
    required this.assessedAt,
    required this.assessmentId,
    required this.inputSha256,
    required this.modelConfigVersion,
    required this.rubricSha256,
    required this.rubricVersion,
    required this.schemaVersion,
    required this.sourceSnapshotSha256,
  });

  factory ReaderSummaryPromotionV3AssessmentDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryPromotionV3AssessmentDtoFromJson(json);

  final dynamic answers;
  final String assessedAt;
  final String assessmentId;
  final String inputSha256;
  final String modelConfigVersion;
  final String rubricSha256;
  final String rubricVersion;
  final ReaderSummaryPromotionV3AssessmentDtoSchemaVersionSchemaVersion
  schemaVersion;
  final String sourceSnapshotSha256;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryPromotionV3AssessmentDtoToJson(this);
}
