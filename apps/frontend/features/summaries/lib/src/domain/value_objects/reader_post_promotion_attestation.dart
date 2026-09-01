enum ReaderPostPromotionPlacement { top, additional }

final class ReaderPostPromotionAttestation {
  const ReaderPostPromotionAttestation({
    this.schemaVersion = 'reader_post_promotion_attestation.v1',
    this.policyVersion = 'reader_post_promotion.v1',
    required this.candidateId,
    required this.canonicalIdentity,
    required this.placement,
    required this.slot,
    required this.decision,
    this.citationIds = const [],
    this.storyClusterId,
    this.scoreComponents,
    this.reasonCodes = const [],
    this.candidateDigestInput,
    this.slateEntryDigestInput,
    this.slateDigestInput,
    this.slateDigest,
    this.evidenceLineage,
  });

  final String schemaVersion;
  final String policyVersion;
  final String candidateId;
  final String canonicalIdentity;
  final ReaderPostPromotionPlacement placement;
  final int slot;
  final String decision;
  final List<String> citationIds;
  final String? storyClusterId;
  final ReaderPostPromotionScoreComponents? scoreComponents;
  final List<String> reasonCodes;
  final String? candidateDigestInput;
  final String? slateEntryDigestInput;
  final String? slateDigestInput;
  final String? slateDigest;
  final ReaderPostPromotionEvidenceLineage? evidenceLineage;

  bool get isV2 => schemaVersion == 'reader_post_promotion_attestation.v2';
}

final class ReaderPostPromotionScoreComponents {
  const ReaderPostPromotionScoreComponents({
    required this.engagementSalience,
    required this.relevance,
    required this.evidenceQuality,
    required this.integrity,
    required this.freshness,
    required this.weightedEngagement,
    required this.weightedRelevance,
    required this.weightedEvidenceQuality,
    required this.weightedIntegrity,
    required this.weightedFreshness,
    required this.total,
  });

  final double engagementSalience;
  final double relevance;
  final double evidenceQuality;
  final double integrity;
  final double freshness;
  final double weightedEngagement;
  final double weightedRelevance;
  final double weightedEvidenceQuality;
  final double weightedIntegrity;
  final double weightedFreshness;
  final double total;
}

final class ReaderPostPromotionEvidenceLineage {
  const ReaderPostPromotionEvidenceLineage({
    required this.leadCandidateId,
    required this.leadCitationId,
    required this.supportCandidateIds,
    required this.supportCitationIds,
    required this.citationIds,
  });

  final String leadCandidateId;
  final String leadCitationId;
  final List<String> supportCandidateIds;
  final List<String> supportCitationIds;
  final List<String> citationIds;
}
