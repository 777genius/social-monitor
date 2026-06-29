// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'summary_artifact_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SummaryArtifactResponseDto _$SummaryArtifactResponseDtoFromJson(
  Map<String, dynamic> json,
) => SummaryArtifactResponseDto(
  citations: (json['citations'] as List<dynamic>)
      .map((e) => SummaryCitationViewDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  confidence: SummaryConfidenceDto.fromJson(
    json['confidence'] as Map<String, dynamic>,
  ),
  executiveSummary: json['executiveSummary'] as String,
  freshness: SummaryFreshnessDto.fromJson(
    json['freshness'] as Map<String, dynamic>,
  ),
  headline: json['headline'] as String,
  interestId: json['interestId'] as String,
  keyPoints: (json['keyPoints'] as List<dynamic>)
      .map((e) => SummaryKeyPointDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  lineage: SummaryLineageDto.fromJson(json['lineage'] as Map<String, dynamic>),
  qualityFlags: (json['qualityFlags'] as List<dynamic>)
      .map(
        (e) => SummaryArtifactResponseDtoQualityFlagsQualityFlags.fromJson(
          e as String,
        ),
      )
      .toList(),
  risksAndUnknowns: (json['risksAndUnknowns'] as List<dynamic>)
      .map((e) => SummaryRiskDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  schemaVersion: json['schemaVersion'] as String,
  sourceHighlights: (json['sourceHighlights'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  sourceWindow: SummarySourceWindowDto.fromJson(
    json['sourceWindow'] as Map<String, dynamic>,
  ),
  summaryId: json['summaryId'] as String,
  tenantId: json['tenantId'] as String,
  usage: SummaryUsageDto.fromJson(json['usage'] as Map<String, dynamic>),
  workspaceId: json['workspaceId'] as String,
  noSignalReason: json['noSignalReason'] as String?,
  subscriptionId: json['subscriptionId'] as String?,
  userId: json['userId'] as String?,
);

Map<String, dynamic> _$SummaryArtifactResponseDtoToJson(
  SummaryArtifactResponseDto instance,
) => <String, dynamic>{
  'citations': instance.citations,
  'confidence': instance.confidence,
  'executiveSummary': instance.executiveSummary,
  'freshness': instance.freshness,
  'headline': instance.headline,
  'interestId': instance.interestId,
  'keyPoints': instance.keyPoints,
  'lineage': instance.lineage,
  'noSignalReason': instance.noSignalReason,
  'qualityFlags': instance.qualityFlags,
  'risksAndUnknowns': instance.risksAndUnknowns,
  'schemaVersion': instance.schemaVersion,
  'sourceHighlights': instance.sourceHighlights,
  'sourceWindow': instance.sourceWindow,
  'subscriptionId': instance.subscriptionId,
  'summaryId': instance.summaryId,
  'tenantId': instance.tenantId,
  'usage': instance.usage,
  'userId': instance.userId,
  'workspaceId': instance.workspaceId,
};
