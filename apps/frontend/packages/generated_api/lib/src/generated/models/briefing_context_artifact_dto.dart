// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_context_artifact_dto_freshness_freshness.dart';
import 'briefing_scope_dto.dart';

part 'briefing_context_artifact_dto.g.dart';

@JsonSerializable()
class BriefingContextArtifactDto {
  const BriefingContextArtifactDto({
    required this.artifactId,
    required this.freshness,
    required this.generatedAt,
    required this.scope,
    required this.summaryText,
  });

  factory BriefingContextArtifactDto.fromJson(Map<String, Object?> json) =>
      _$BriefingContextArtifactDtoFromJson(json);

  final String artifactId;
  final BriefingContextArtifactDtoFreshnessFreshness freshness;
  final DateTime generatedAt;
  final BriefingScopeDto scope;
  final String summaryText;

  Map<String, Object?> toJson() => _$BriefingContextArtifactDtoToJson(this);
}
