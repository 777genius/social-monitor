// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_weekly_projection_artifact_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryWeeklyProjectionArtifactDto
_$ReaderSummaryWeeklyProjectionArtifactDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryWeeklyProjectionArtifactDto(
      artifactId: json['artifactId'] as String,
      artifactSha256: json['artifactSha256'] as String,
      citations: (json['citations'] as List<dynamic>)
          .map(
            (e) => ReaderSummaryWeeklyProjectionCitationDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      editorialQualitySha256: json['editorialQualitySha256'] as String,
      headline: json['headline'] as String,
      headlineCitationIds: (json['headlineCitationIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      modelInputSealId: json['modelInputSealId'] as String,
      modelInputSealSha256: json['modelInputSealSha256'] as String,
      publicationProofId: json['publicationProofId'] as String,
      publicationProofSha256: json['publicationProofSha256'] as String,
      schemaVersion: json['schemaVersion'] as String,
      sealId: json['sealId'] as String,
      sealSha256: json['sealSha256'] as String,
      sections: (json['sections'] as List<dynamic>)
          .map(
            (e) => ReaderSummaryWeeklyProjectionSectionDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      stories: (json['stories'] as List<dynamic>)
          .map(
            (e) => ReaderSummaryWeeklyProjectionStoryDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      synthesis: json['synthesis'] as String,
      synthesisCitationIds: (json['synthesisCitationIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      takeaway: json['takeaway'] as String,
      takeawayCitationIds: (json['takeawayCitationIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$ReaderSummaryWeeklyProjectionArtifactDtoToJson(
  ReaderSummaryWeeklyProjectionArtifactDto instance,
) => <String, dynamic>{
  'artifactId': instance.artifactId,
  'artifactSha256': instance.artifactSha256,
  'citations': instance.citations,
  'editorialQualitySha256': instance.editorialQualitySha256,
  'headline': instance.headline,
  'headlineCitationIds': instance.headlineCitationIds,
  'modelInputSealId': instance.modelInputSealId,
  'modelInputSealSha256': instance.modelInputSealSha256,
  'publicationProofId': instance.publicationProofId,
  'publicationProofSha256': instance.publicationProofSha256,
  'schemaVersion': instance.schemaVersion,
  'sealId': instance.sealId,
  'sealSha256': instance.sealSha256,
  'sections': instance.sections,
  'stories': instance.stories,
  'synthesis': instance.synthesis,
  'synthesisCitationIds': instance.synthesisCitationIds,
  'takeaway': instance.takeaway,
  'takeawayCitationIds': instance.takeawayCitationIds,
};
