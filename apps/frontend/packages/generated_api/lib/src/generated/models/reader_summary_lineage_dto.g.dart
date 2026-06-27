// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_lineage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryLineageDto _$ReaderSummaryLineageDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryLineageDto(
  evalDatasetVersion: json['evalDatasetVersion'] as String,
  modelVersion: json['modelVersion'] as String,
  promptVersion: json['promptVersion'] as String,
  providerVersion: json['providerVersion'] as String,
  rulesVersion: json['rulesVersion'] as String,
  schemaVersion: json['schemaVersion'] as String,
  rankingPolicyVersion: json['rankingPolicyVersion'] as String?,
);

Map<String, dynamic> _$ReaderSummaryLineageDtoToJson(
  ReaderSummaryLineageDto instance,
) => <String, dynamic>{
  'evalDatasetVersion': instance.evalDatasetVersion,
  'modelVersion': instance.modelVersion,
  'promptVersion': instance.promptVersion,
  'providerVersion': instance.providerVersion,
  'rankingPolicyVersion': instance.rankingPolicyVersion,
  'rulesVersion': instance.rulesVersion,
  'schemaVersion': instance.schemaVersion,
};
