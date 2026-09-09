import 'dart:convert';

import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../anti_corruption/reader_post_promotion_attestation_verifier.dart';
import '../api/summary_api_dto.dart';

ReaderPostPromotionAttestationApiDto? mapReaderPostPromotionAttestation(
  generated.ReaderSummaryPromotionAttestationDto? dto, {
  Object? displayHeadline,
  Object? capturedSource,
  String? cardTitle,
  String? tenantId,
  String? workspaceId,
  String? sourceItemId,
  String? sourceCandidateId,
  String? cardProviderKey,
  String? cardStoryClusterId,
  DateTime? cardPublishedAt,
  List<String>? cardCitationIds,
  required String enclosingArtifactId,
  required String enclosingSourceWindowId,
  required DateTime enclosingPeriodStart,
  required DateTime enclosingPeriodEnd,
  required DateTime? enclosingIngestionCutoff,
}) {
  if (dto == null) return null;
  return verifyReaderPostPromotionAttestation(
    schemaVersion: dto.schemaVersion.json,
    policyVersion: dto.policyVersion.json,
    digestVersion: dto.digestVersion.json,
    digest: dto.digest,
    canonicalPayload: dto.canonicalPayload,
    candidateId: dto.candidateId,
    canonicalIdentity: dto.canonicalIdentity,
    placement: dto.placement.json,
    artifactId: dto.artifactId,
    sourceWindowId: dto.sourceWindowId,
    enclosingArtifactId: enclosingArtifactId,
    enclosingSourceWindowId: enclosingSourceWindowId,
    enclosingPeriodStart: enclosingPeriodStart,
    enclosingPeriodEnd: enclosingPeriodEnd,
    enclosingIngestionCutoff: enclosingIngestionCutoff,
    slot: dto.slot.toInt() == dto.slot ? dto.slot.toInt() : -1,
    decision: dto.decision.json,
    citationIds: dto.citationIds,
    storyClusterId: dto.storyClusterId,
    scoreComponents: dto.scoreComponents == null
        ? null
        : ReaderPostPromotionScoreComponentsApiDto(
            engagementSalience: dto.scoreComponents!.engagementSalience
                .toDouble(),
            relevance: dto.scoreComponents!.relevance.toDouble(),
            evidenceQuality: dto.scoreComponents!.evidenceQuality.toDouble(),
            integrity: dto.scoreComponents!.integrity.toDouble(),
            freshness: dto.scoreComponents!.freshness.toDouble(),
            weightedEngagement: dto.scoreComponents!.weightedEngagement
                .toDouble(),
            weightedRelevance: dto.scoreComponents!.weightedRelevance
                .toDouble(),
            weightedEvidenceQuality: dto
                .scoreComponents!
                .weightedEvidenceQuality
                .toDouble(),
            weightedIntegrity: dto.scoreComponents!.weightedIntegrity
                .toDouble(),
            weightedFreshness: dto.scoreComponents!.weightedFreshness
                .toDouble(),
            total: dto.scoreComponents!.total.toDouble(),
          ),
    reasonCodes: dto.reasonCodes,
    candidateDigestInput: dto.candidateDigestInput,
    slateEntryDigestInput: dto.slateEntryDigestInput,
    slateDigestInput: dto.slateDigestInput,
    slateDigest: dto.slateDigest,
    evidenceLineage: dto.evidenceLineage == null
        ? null
        : ReaderPostPromotionEvidenceLineageApiDto(
            leadCandidateId: dto.evidenceLineage!.leadCandidateId,
            leadCitationId: dto.evidenceLineage!.leadCitationId,
            supportCandidateIds: dto.evidenceLineage!.supportCandidateIds,
            supportCitationIds: dto.evidenceLineage!.supportCitationIds,
            citationIds: dto.evidenceLineage!.citationIds,
          ),
    displayHeadline: displayHeadline,
    capturedSource: capturedSource,
    displayHeadlineSeal: displayJson(dto.toJson()['displayHeadline']),
    cardTitle: cardTitle,
    tenantId: tenantId,
    workspaceId: workspaceId,
    sourceItemId: sourceItemId,
    sourceCandidateId: sourceCandidateId,
    cardProviderKey: cardProviderKey,
    cardStoryClusterId: cardStoryClusterId,
    cardPublishedAt: cardPublishedAt,
    cardCitationIds: cardCitationIds,
  );
}

// Generated optional fields serialize null; absence is preserved for sealed JSON.
Object? displayJson(Object? value) => _withoutNulls(jsonDecode(jsonEncode(value)));

Object? _withoutNulls(Object? value) {
  if (value is List<Object?>) return value.map(_withoutNulls).toList();
  if (value is Map<String, Object?>) {
    return {for (final entry in value.entries)
      if (entry.value != null) entry.key: _withoutNulls(entry.value)};
  }
  return value;
}
