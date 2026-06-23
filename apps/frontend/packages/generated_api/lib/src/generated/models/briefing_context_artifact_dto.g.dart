// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_context_artifact_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingContextArtifactDto _$BriefingContextArtifactDtoFromJson(
  Map<String, dynamic> json,
) => BriefingContextArtifactDto(
  artifactId: json['artifactId'] as String,
  freshness: BriefingContextArtifactDtoFreshnessFreshness.fromJson(
    json['freshness'] as String,
  ),
  generatedAt: DateTime.parse(json['generatedAt'] as String),
  scope: BriefingScopeDto.fromJson(json['scope'] as Map<String, dynamic>),
  summaryText: json['summaryText'] as String,
);

Map<String, dynamic> _$BriefingContextArtifactDtoToJson(
  BriefingContextArtifactDto instance,
) => <String, dynamic>{
  'artifactId': instance.artifactId,
  'freshness': instance.freshness,
  'generatedAt': instance.generatedAt.toIso8601String(),
  'scope': instance.scope,
  'summaryText': instance.summaryText,
};
