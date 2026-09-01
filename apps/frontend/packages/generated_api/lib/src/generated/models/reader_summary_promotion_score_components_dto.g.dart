// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_promotion_score_components_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPromotionScoreComponentsDto
_$ReaderSummaryPromotionScoreComponentsDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryPromotionScoreComponentsDto(
      engagementSalience: json['engagementSalience'] as num,
      evidenceQuality: json['evidenceQuality'] as num,
      freshness: json['freshness'] as num,
      integrity: json['integrity'] as num,
      relevance: json['relevance'] as num,
      total: json['total'] as num,
      weightedEngagement: json['weightedEngagement'] as num,
      weightedEvidenceQuality: json['weightedEvidenceQuality'] as num,
      weightedFreshness: json['weightedFreshness'] as num,
      weightedIntegrity: json['weightedIntegrity'] as num,
      weightedRelevance: json['weightedRelevance'] as num,
    );

Map<String, dynamic> _$ReaderSummaryPromotionScoreComponentsDtoToJson(
  ReaderSummaryPromotionScoreComponentsDto instance,
) => <String, dynamic>{
  'engagementSalience': instance.engagementSalience,
  'evidenceQuality': instance.evidenceQuality,
  'freshness': instance.freshness,
  'integrity': instance.integrity,
  'relevance': instance.relevance,
  'total': instance.total,
  'weightedEngagement': instance.weightedEngagement,
  'weightedEvidenceQuality': instance.weightedEvidenceQuality,
  'weightedFreshness': instance.weightedFreshness,
  'weightedIntegrity': instance.weightedIntegrity,
  'weightedRelevance': instance.weightedRelevance,
};
