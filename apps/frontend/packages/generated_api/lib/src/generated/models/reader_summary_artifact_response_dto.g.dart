// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_artifact_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryArtifactResponseDto _$ReaderSummaryArtifactResponseDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryArtifactResponseDto(
  citations: (json['citations'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryCitationViewDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  confidence: ReaderSummaryConfidenceDto.fromJson(
    json['confidence'] as Map<String, dynamic>,
  ),
  contextArtifacts: (json['contextArtifacts'] as List<dynamic>)
      .map(
        (e) =>
            ReaderSummaryContextArtifactDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  executiveSummary: json['executiveSummary'] as String,
  freshness: ReaderSummaryFreshnessDto.fromJson(
    json['freshness'] as Map<String, dynamic>,
  ),
  headline: json['headline'] as String,
  interestHighlights: (json['interestHighlights'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryInterestHighlightDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  lineage: ReaderSummaryLineageDto.fromJson(
    json['lineage'] as Map<String, dynamic>,
  ),
  period: ReaderSummaryPeriodDto.fromJson(
    json['period'] as Map<String, dynamic>,
  ),
  qualityFlags: (json['qualityFlags'] as List<dynamic>)
      .map(
        (e) =>
            ReaderSummaryArtifactResponseDtoQualityFlagsQualityFlags.fromJson(
              e as String,
            ),
      )
      .toList(),
  readerBrief: ReaderSummaryReaderBriefDto.fromJson(
    json['readerBrief'] as Map<String, dynamic>,
  ),
  readerSummaryId: json['readerSummaryId'] as String,
  repeatedSignals: (json['repeatedSignals'] as List<dynamic>)
      .map(
        (e) =>
            ReaderSummaryRepeatedSignalDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  risksAndUnknowns: (json['risksAndUnknowns'] as List<dynamic>)
      .map((e) => ReaderSummaryRiskDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  schemaVersion: json['schemaVersion'] as String,
  scope: ReaderSummaryScopeDto.fromJson(json['scope'] as Map<String, dynamic>),
  sourceWindow: ReaderSummarySourceWindowDto.fromJson(
    json['sourceWindow'] as Map<String, dynamic>,
  ),
  storyClusters: (json['storyClusters'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryStoryClusterDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  tenantId: json['tenantId'] as String,
  topStories: (json['topStories'] as List<dynamic>)
      .map((e) => ReaderSummaryTopStoryDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  usage: ReaderSummaryUsageDto.fromJson(json['usage'] as Map<String, dynamic>),
  workspaceId: json['workspaceId'] as String,
  coverage: json['coverage'] == null
      ? null
      : ReaderSummaryCoverageSummaryDto.fromJson(
          json['coverage'] as Map<String, dynamic>,
        ),
  noSignalReason: json['noSignalReason'] as String?,
  personalization: json['personalization'] == null
      ? null
      : ReaderSummaryPersonalizationDto.fromJson(
          json['personalization'] as Map<String, dynamic>,
        ),
  subscriptionId: json['subscriptionId'] as String?,
  userId: json['userId'] as String?,
);

Map<String, dynamic> _$ReaderSummaryArtifactResponseDtoToJson(
  ReaderSummaryArtifactResponseDto instance,
) => <String, dynamic>{
  'citations': instance.citations,
  'confidence': instance.confidence,
  'contextArtifacts': instance.contextArtifacts,
  'coverage': instance.coverage,
  'executiveSummary': instance.executiveSummary,
  'freshness': instance.freshness,
  'headline': instance.headline,
  'interestHighlights': instance.interestHighlights,
  'lineage': instance.lineage,
  'noSignalReason': instance.noSignalReason,
  'period': instance.period,
  'personalization': instance.personalization,
  'qualityFlags': instance.qualityFlags,
  'readerBrief': instance.readerBrief,
  'readerSummaryId': instance.readerSummaryId,
  'repeatedSignals': instance.repeatedSignals,
  'risksAndUnknowns': instance.risksAndUnknowns,
  'schemaVersion': instance.schemaVersion,
  'scope': instance.scope,
  'sourceWindow': instance.sourceWindow,
  'storyClusters': instance.storyClusters,
  'subscriptionId': instance.subscriptionId,
  'tenantId': instance.tenantId,
  'topStories': instance.topStories,
  'usage': instance.usage,
  'userId': instance.userId,
  'workspaceId': instance.workspaceId,
};
