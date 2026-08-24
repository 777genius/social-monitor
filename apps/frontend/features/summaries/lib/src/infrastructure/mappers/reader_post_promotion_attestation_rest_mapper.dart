import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../anti_corruption/reader_post_promotion_attestation_verifier.dart';
import '../api/summary_api_dto.dart';

ReaderPostPromotionAttestationApiDto? mapReaderPostPromotionAttestation(
  generated.ReaderSummaryPromotionAttestationDto? dto, {
  String? cardProviderKey,
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
    cardProviderKey: cardProviderKey,
    cardPublishedAt: cardPublishedAt,
    cardCitationIds: cardCitationIds,
  );
}
