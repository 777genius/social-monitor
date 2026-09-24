// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_display_headline_seal_dto.dart';
import 'reader_summary_promotion_attestation_dto_decision_decision.dart';
import 'reader_summary_promotion_attestation_dto_digest_version_digest_version.dart';
import 'reader_summary_promotion_attestation_dto_placement_placement.dart';
import 'reader_summary_promotion_attestation_dto_policy_version_policy_version.dart';
import 'reader_summary_promotion_attestation_dto_schema_version_schema_version.dart';
import 'reader_summary_promotion_evidence_lineage_dto.dart';
import 'reader_summary_promotion_score_components_dto.dart';
import 'reader_summary_promotion_v3_assessment_dto.dart';
import 'reader_summary_promotion_v3_comparator_dto.dart';
import 'reader_summary_promotion_v3_presentation_dto.dart';

part 'reader_summary_promotion_attestation_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPromotionAttestationDto {
  const ReaderSummaryPromotionAttestationDto({
    required this.artifactId,
    required this.candidateId,
    required this.canonicalIdentity,
    required this.canonicalPayload,
    required this.citationIds,
    required this.decision,
    required this.digest,
    required this.digestVersion,
    required this.placement,
    required this.policyVersion,
    required this.schemaVersion,
    required this.slot,
    required this.sourceWindowId,
    this.assessment,
    this.candidateDigestInput,
    this.comparator,
    this.displayHeadline,
    this.displaySummary,
    this.evidenceLineage,
    this.exactIngestionCutoff,
    this.ingestionCutoff,
    this.periodEndedAt,
    this.periodStartedAt,
    this.presentation,
    this.provider,
    this.publishedAt,
    this.reasonCodes,
    this.scoreComponents,
    this.slateDigest,
    this.slateDigestInput,
    this.slateEntryDigestInput,
    this.storyClusterId,
    this.storyId,
  });

  factory ReaderSummaryPromotionAttestationDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryPromotionAttestationDtoFromJson(json);

  final String artifactId;
  final ReaderSummaryPromotionV3AssessmentDto? assessment;
  final String? candidateDigestInput;
  final String candidateId;
  final String canonicalIdentity;
  final String canonicalPayload;
  final List<String> citationIds;
  final ReaderSummaryPromotionV3ComparatorDto? comparator;
  final ReaderSummaryPromotionAttestationDtoDecisionDecision decision;
  final String digest;
  final ReaderSummaryPromotionAttestationDtoDigestVersionDigestVersion
  digestVersion;
  final ReaderSummaryDisplayHeadlineSealDto? displayHeadline;
  final String? displaySummary;
  final ReaderSummaryPromotionEvidenceLineageDto? evidenceLineage;
  final String? exactIngestionCutoff;
  final DateTime? ingestionCutoff;
  final DateTime? periodEndedAt;
  final DateTime? periodStartedAt;
  final ReaderSummaryPromotionAttestationDtoPlacementPlacement placement;
  final ReaderSummaryPromotionAttestationDtoPolicyVersionPolicyVersion
  policyVersion;
  final ReaderSummaryPromotionV3PresentationDto? presentation;
  final String? provider;
  final String? publishedAt;
  final List<String>? reasonCodes;
  final ReaderSummaryPromotionAttestationDtoSchemaVersionSchemaVersion
  schemaVersion;
  final ReaderSummaryPromotionScoreComponentsDto? scoreComponents;
  final String? slateDigest;
  final String? slateDigestInput;
  final String? slateEntryDigestInput;
  final num slot;
  final String sourceWindowId;
  final String? storyClusterId;
  final String? storyId;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryPromotionAttestationDtoToJson(this);
}
