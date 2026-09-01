// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_promotion_evidence_lineage_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPromotionEvidenceLineageDto {
  const ReaderSummaryPromotionEvidenceLineageDto({
    required this.citationIds,
    required this.leadCandidateId,
    required this.leadCitationId,
    required this.supportCandidateIds,
    required this.supportCitationIds,
  });

  factory ReaderSummaryPromotionEvidenceLineageDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryPromotionEvidenceLineageDtoFromJson(json);

  final List<String> citationIds;
  final String leadCandidateId;
  final String leadCitationId;
  final List<String> supportCandidateIds;
  final List<String> supportCitationIds;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryPromotionEvidenceLineageDtoToJson(this);
}
