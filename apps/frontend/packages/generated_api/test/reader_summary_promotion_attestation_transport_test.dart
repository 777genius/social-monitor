import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:test/test.dart';

void main() {
  test('preserves the public V2 promotion contract from raw REST JSON', () {
    final attestation = ReaderSummaryPromotionAttestationDto.fromJson({
      'artifactId': 'artifact-2026-08-31',
      'candidateDigestInput': 'candidate-digest-input',
      'candidateId': 'candidate-alpha',
      'canonicalIdentity': 'canonical-alpha',
      'canonicalPayload': 'canonical-payload',
      'citationIds': ['citation-lead', 'citation-support'],
      'decision': 'promoted',
      'digest': 'publication-digest',
      'digestVersion': 'reader_post_promotion_digest.sha256.v2',
      'evidenceLineage': {
        'citationIds': ['citation-lead', 'citation-support'],
        'leadCandidateId': 'candidate-alpha',
        'leadCitationId': 'citation-lead',
        'supportCandidateIds': ['candidate-beta'],
        'supportCitationIds': ['citation-support'],
      },
      'placement': 'additional',
      'policyVersion': 'reader_post_promotion.v2',
      'reasonCodes': ['top-tier-overflow'],
      'schemaVersion': 'reader_post_promotion_attestation.v2',
      'scoreComponents': {
        'engagementSalience': 0.4,
        'evidenceQuality': 0.9,
        'freshness': 0.8,
        'integrity': 1,
        'relevance': 0.95,
        'total': 0.84,
        'weightedEngagement': 0.04,
        'weightedEvidenceQuality': 0.18,
        'weightedFreshness': 0.16,
        'weightedIntegrity': 0.2,
        'weightedRelevance': 0.26,
      },
      'slateDigest': 'slate-digest',
      'slateDigestInput': 'slate-digest-input',
      'slateEntryDigestInput': 'slate-entry-digest-input',
      'slot': 3,
      'sourceWindowId': 'window-2026-08-31',
      'storyClusterId': 'story-alpha',
    });

    expect(attestation.policyVersion.json, 'reader_post_promotion.v2');
    expect(
      attestation.schemaVersion.json,
      'reader_post_promotion_attestation.v2',
    );
    expect(
      attestation.digestVersion.json,
      'reader_post_promotion_digest.sha256.v2',
    );
    expect(attestation.reasonCodes, ['top-tier-overflow']);
    expect(attestation.evidenceLineage?.leadCandidateId, 'candidate-alpha');
    expect(attestation.scoreComponents?.total, 0.84);
    expect(attestation.slateDigestInput, 'slate-digest-input');
  });
}
