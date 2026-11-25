// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_promotion_score_components_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPromotionScoreComponentsDto {
  const ReaderSummaryPromotionScoreComponentsDto({
    required this.engagementSalience,
    required this.evidenceQuality,
    required this.freshness,
    required this.integrity,
    required this.relevance,
    required this.total,
    required this.weightedEngagement,
    required this.weightedEvidenceQuality,
    required this.weightedFreshness,
    required this.weightedIntegrity,
    required this.weightedRelevance,
  });

  factory ReaderSummaryPromotionScoreComponentsDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryPromotionScoreComponentsDtoFromJson(json);

  final num engagementSalience;
  final num evidenceQuality;
  final num freshness;
  final num integrity;
  final num relevance;
  final num total;
  final num weightedEngagement;
  final num weightedEvidenceQuality;
  final num weightedFreshness;
  final num weightedIntegrity;
  final num weightedRelevance;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryPromotionScoreComponentsDtoToJson(this);
}
