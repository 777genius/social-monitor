import 'dart:convert';

import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import 'reader_summary_artifact_binding.dart';

/// Feed and source item a promoted card's attestation is bound to, resolved
/// through the artifact citations rather than trusted from the card.
final class ReaderPromotionCitationBinding {
  const ReaderPromotionCitationBinding(this.candidateId, this.sourceItemId);

  final String candidateId;
  final String sourceItemId;
}

/// V1/V2 attestations bind through their lead citation. V3 attestations
/// must match exactly one of their citations by candidate (feed item),
/// source item and the exact signed provider key; anything else is unbound.
ReaderPromotionCitationBinding? readerPromotionCitationBinding(
  generated.ReaderSummaryPromotionAttestationDto? attestation,
  ReaderSummaryArtifactBinding binding,
) {
  if (attestation == null) return null;
  final canonicalPayload = _canonicalAttestationPayload(
    attestation.canonicalPayload,
  );
  final isV3 =
      attestation.schemaVersion.json ==
          'reader_post_promotion_attestation.v3' ||
      canonicalPayload?['schemaVersion'] ==
          'reader_post_promotion_attestation.v3';
  if (!isV3) {
    final citationId = attestation.evidenceLineage?.leadCitationId;
    if (citationId == null) return null;
    final candidateId = binding.feedItemIdsByCitation[citationId];
    final sourceItemId = binding.sourceItemIdsByCitation[citationId];
    return candidateId == null || sourceItemId == null
        ? null
        : ReaderPromotionCitationBinding(candidateId, sourceItemId);
  }
  final provider = canonicalPayload?['provider'];
  final matches = attestation.citationIds
      .where(
        (citationId) =>
            binding.feedItemIdsByCitation[citationId] ==
                attestation.candidateId &&
            binding.sourceItemIdsByCitation[citationId] != null &&
            provider is String &&
            binding.providerKeysByCitation[citationId] == provider,
      )
      .toList(growable: false);
  if (matches.length != 1) return null;
  return ReaderPromotionCitationBinding(
    binding.feedItemIdsByCitation[matches.single]!,
    binding.sourceItemIdsByCitation[matches.single]!,
  );
}

Map<String, Object?>? _canonicalAttestationPayload(String value) {
  try {
    final decoded = jsonDecode(value);
    return decoded is Map<String, Object?> ? decoded : null;
  } on FormatException {
    return null;
  }
}
