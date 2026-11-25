// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_promotion_v3_assessment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPromotionV3AssessmentDto
_$ReaderSummaryPromotionV3AssessmentDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryPromotionV3AssessmentDto(
  answers: json['answers'],
  assessedAt: json['assessedAt'] as String,
  assessmentId: json['assessmentId'] as String,
  inputSha256: json['inputSha256'] as String,
  modelConfigVersion: json['modelConfigVersion'] as String,
  rubricSha256: json['rubricSha256'] as String,
  rubricVersion: json['rubricVersion'] as String,
  schemaVersion:
      ReaderSummaryPromotionV3AssessmentDtoSchemaVersionSchemaVersion.fromJson(
        json['schemaVersion'] as String,
      ),
  sourceSnapshotSha256: json['sourceSnapshotSha256'] as String,
);

Map<String, dynamic> _$ReaderSummaryPromotionV3AssessmentDtoToJson(
  ReaderSummaryPromotionV3AssessmentDto instance,
) => <String, dynamic>{
  'answers': instance.answers,
  'assessedAt': instance.assessedAt,
  'assessmentId': instance.assessmentId,
  'inputSha256': instance.inputSha256,
  'modelConfigVersion': instance.modelConfigVersion,
  'rubricSha256': instance.rubricSha256,
  'rubricVersion': instance.rubricVersion,
  'schemaVersion': instance.schemaVersion,
  'sourceSnapshotSha256': instance.sourceSnapshotSha256,
};
