// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_weekly_projection_citation_dto.dart';
import 'reader_summary_weekly_projection_section_dto.dart';
import 'reader_summary_weekly_projection_story_dto.dart';

part 'reader_summary_weekly_projection_artifact_dto.g.dart';

@JsonSerializable()
class ReaderSummaryWeeklyProjectionArtifactDto {
  const ReaderSummaryWeeklyProjectionArtifactDto({
    required this.artifactId,
    required this.artifactSha256,
    required this.citations,
    required this.editorialQualitySha256,
    required this.headline,
    required this.headlineCitationIds,
    required this.modelInputSealId,
    required this.modelInputSealSha256,
    required this.publicationProofId,
    required this.publicationProofSha256,
    required this.schemaVersion,
    required this.sealId,
    required this.sealSha256,
    required this.sections,
    required this.stories,
    required this.synthesis,
    required this.synthesisCitationIds,
    required this.takeaway,
    required this.takeawayCitationIds,
  });

  factory ReaderSummaryWeeklyProjectionArtifactDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryWeeklyProjectionArtifactDtoFromJson(json);

  final String artifactId;
  final String artifactSha256;
  final List<ReaderSummaryWeeklyProjectionCitationDto> citations;
  final String editorialQualitySha256;
  final String headline;
  final List<String> headlineCitationIds;
  final String modelInputSealId;
  final String modelInputSealSha256;
  final String publicationProofId;
  final String publicationProofSha256;
  final String schemaVersion;
  final String sealId;
  final String sealSha256;
  final List<ReaderSummaryWeeklyProjectionSectionDto> sections;
  final List<ReaderSummaryWeeklyProjectionStoryDto> stories;
  final String synthesis;
  final List<String> synthesisCitationIds;
  final String takeaway;
  final List<String> takeawayCitationIds;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryWeeklyProjectionArtifactDtoToJson(this);
}
