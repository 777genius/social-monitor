// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_context_artifact_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryContextArtifactDto _$ReaderSummaryContextArtifactDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryContextArtifactDto(
  artifactId: json['artifactId'] as String,
  freshness: ReaderSummaryContextArtifactDtoFreshnessFreshness.fromJson(
    json['freshness'] as String,
  ),
  generatedAt: DateTime.parse(json['generatedAt'] as String),
  scope: ReaderSummaryScopeDto.fromJson(json['scope'] as Map<String, dynamic>),
  summaryText: json['summaryText'] as String,
);

Map<String, dynamic> _$ReaderSummaryContextArtifactDtoToJson(
  ReaderSummaryContextArtifactDto instance,
) => <String, dynamic>{
  'artifactId': instance.artifactId,
  'freshness': instance.freshness,
  'generatedAt': instance.generatedAt.toIso8601String(),
  'scope': instance.scope,
  'summaryText': instance.summaryText,
};
