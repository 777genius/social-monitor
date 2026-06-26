// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingResponseDto _$BriefingResponseDtoFromJson(
  Map<String, dynamic> json,
) => BriefingResponseDto(
  briefingId: json['briefingId'] as String,
  citations: (json['citations'] as List<dynamic>)
      .map((e) => BriefingCitationViewDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  confidence: BriefingConfidenceDto.fromJson(
    json['confidence'] as Map<String, dynamic>,
  ),
  contextArtifacts: (json['contextArtifacts'] as List<dynamic>)
      .map(
        (e) => BriefingContextArtifactDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  executiveSummary: json['executiveSummary'] as String,
  freshness: BriefingFreshnessDto.fromJson(
    json['freshness'] as Map<String, dynamic>,
  ),
  headline: json['headline'] as String,
  lineage: BriefingLineageDto.fromJson(json['lineage'] as Map<String, dynamic>),
  qualityFlags: (json['qualityFlags'] as List<dynamic>)
      .map(
        (e) =>
            BriefingResponseDtoQualityFlagsQualityFlags.fromJson(e as String),
      )
      .toList(),
  readerBrief: BriefingReaderBriefDto.fromJson(
    json['readerBrief'] as Map<String, dynamic>,
  ),
  repeatedSignals: (json['repeatedSignals'] as List<dynamic>)
      .map((e) => BriefingRepeatedSignalDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  risksAndUnknowns: (json['risksAndUnknowns'] as List<dynamic>)
      .map((e) => BriefingRiskDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  schemaVersion: json['schemaVersion'] as String,
  scope: BriefingScopeDto.fromJson(json['scope'] as Map<String, dynamic>),
  sourceWindow: BriefingSourceWindowDto.fromJson(
    json['sourceWindow'] as Map<String, dynamic>,
  ),
  storyClusters: (json['storyClusters'] as List<dynamic>)
      .map((e) => BriefingStoryClusterDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  tenantId: json['tenantId'] as String,
  topicHighlights: (json['topicHighlights'] as List<dynamic>)
      .map((e) => BriefingTopicHighlightDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  topStories: (json['topStories'] as List<dynamic>)
      .map((e) => BriefingTopStoryDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  usage: BriefingUsageDto.fromJson(json['usage'] as Map<String, dynamic>),
  workspaceId: json['workspaceId'] as String,
  coverage: json['coverage'] == null
      ? null
      : BriefingCoverageSummaryDto.fromJson(
          json['coverage'] as Map<String, dynamic>,
        ),
  noSignalReason: json['noSignalReason'] as String?,
  personalization: json['personalization'] == null
      ? null
      : BriefingPersonalizationDto.fromJson(
          json['personalization'] as Map<String, dynamic>,
        ),
  subscriptionId: json['subscriptionId'] as String?,
  userId: json['userId'] as String?,
);

Map<String, dynamic> _$BriefingResponseDtoToJson(
  BriefingResponseDto instance,
) => <String, dynamic>{
  'briefingId': instance.briefingId,
  'citations': instance.citations,
  'confidence': instance.confidence,
  'contextArtifacts': instance.contextArtifacts,
  'coverage': instance.coverage,
  'executiveSummary': instance.executiveSummary,
  'freshness': instance.freshness,
  'headline': instance.headline,
  'lineage': instance.lineage,
  'noSignalReason': instance.noSignalReason,
  'personalization': instance.personalization,
  'qualityFlags': instance.qualityFlags,
  'readerBrief': instance.readerBrief,
  'repeatedSignals': instance.repeatedSignals,
  'risksAndUnknowns': instance.risksAndUnknowns,
  'schemaVersion': instance.schemaVersion,
  'scope': instance.scope,
  'sourceWindow': instance.sourceWindow,
  'storyClusters': instance.storyClusters,
  'subscriptionId': instance.subscriptionId,
  'tenantId': instance.tenantId,
  'topicHighlights': instance.topicHighlights,
  'topStories': instance.topStories,
  'usage': instance.usage,
  'userId': instance.userId,
  'workspaceId': instance.workspaceId,
};
