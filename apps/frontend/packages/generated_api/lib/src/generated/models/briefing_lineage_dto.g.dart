// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_lineage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingLineageDto _$BriefingLineageDtoFromJson(Map<String, dynamic> json) =>
    BriefingLineageDto(
      evalDatasetVersion: json['evalDatasetVersion'] as String,
      modelVersion: json['modelVersion'] as String,
      promptVersion: json['promptVersion'] as String,
      providerVersion: json['providerVersion'] as String,
      rulesVersion: json['rulesVersion'] as String,
      schemaVersion: json['schemaVersion'] as String,
    );

Map<String, dynamic> _$BriefingLineageDtoToJson(BriefingLineageDto instance) =>
    <String, dynamic>{
      'evalDatasetVersion': instance.evalDatasetVersion,
      'modelVersion': instance.modelVersion,
      'promptVersion': instance.promptVersion,
      'providerVersion': instance.providerVersion,
      'rulesVersion': instance.rulesVersion,
      'schemaVersion': instance.schemaVersion,
    };
