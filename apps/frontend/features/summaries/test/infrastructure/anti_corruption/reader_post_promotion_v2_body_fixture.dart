import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:social_monitor_summaries/src/infrastructure/anti_corruption/reader_post_promotion_attestation_verifier.dart';

Map<String, Object?> v2PromotionCanonicalBody() {
  final score = <String, Object?>{
    'engagementSalience': 0.5,
    'relevance': 0.8,
    'evidenceQuality': 0.8,
    'integrity': 0.8,
    'freshness': 0.4,
    'weightedEngagement': 0.2,
    'weightedRelevance': 0.24,
    'weightedEvidenceQuality': 0.12,
    'weightedIntegrity': 0.08,
    'weightedFreshness': 0.02,
    'total': 0.66,
  };
  final candidateDigestInput = jsonEncode({
    'policyVersion': readerPromotionEditorialSlatePolicyVersion,
    'candidateId': 'candidate-top',
    'canonicalIdentity': 'story:release',
    'provider': 'hacker_news',
  });
  final entry = <String, Object?>{
    'policyVersion': readerPromotionEditorialSlatePolicyVersion,
    'placement': 'top',
    'slot': 1,
    'candidateId': 'candidate-top',
    'canonicalIdentity': 'story:release',
    'provider': 'hacker_news',
    'storyClusterId': 'cluster:release',
    'scoreComponents': score,
    'reasonCodes': ['reader_promotion_v2_admitted', 'top_slot_assigned'],
    'candidateDigestInput': candidateDigestInput,
  };
  final entryInput = jsonEncode(entry);
  final slate = <String, Object?>{
    'policyVersion': readerPromotionEditorialSlatePolicyVersion,
    'sourceWindow': {
      'windowId': 'window-1',
      'startedAt': '2026-08-18T00:00:00.000Z',
      'endedAt': '2026-08-18T23:00:00.000Z',
      'periodStartedAt': '2026-08-18T00:00:00.000Z',
      'periodEndedAt': '2026-08-19T00:00:00.000Z',
      'ingestionCutoff': '2026-08-18T23:00:00.000Z',
    },
    'orderedCandidateIds': ['candidate-top'],
    'orderedCanonicalIdentities': ['story:release'],
    'digestInputs': [entryInput],
  };
  final slateInput = jsonEncode(slate);
  return {
    'schemaVersion': readerPostPromotionAttestationSchemaVersion,
    'policyVersion': readerPostPromotionPolicyVersion,
    'digestVersion': readerPostPromotionDigestVersion,
    'artifactId': 'artifact-1',
    'sourceWindowId': 'window-1',
    'periodStartedAt': '2026-08-18T00:00:00.000Z',
    'periodEndedAt': '2026-08-19T00:00:00.000Z',
    'ingestionCutoff': '2026-08-18T23:00:00.000Z',
    'placement': 'top',
    'slot': 1,
    'candidateId': 'candidate-top',
    'provider': 'hacker-news',
    'contentKind': 'story',
    'canonicalIdentity': 'story:release',
    'publishedAt': '2026-08-18T10:00:00.000Z',
    'observedAt': '2026-08-18T11:00:00.000Z',
    'citationId': 'citation-1',
    'freshnessValid': true,
    'qualityScore': 0.8,
    'relevanceScore': 0.8,
    'integrityScore': 0.8,
    'qualityValid': true,
    'safetyValid': true,
    'citationValid': true,
    'metricsState': 'observed',
    'metrics': {'provider': 'hacker_news', 'points': 50},
    'tier': 'top',
    'decision': 'promote_top',
    'reason': 'top_engagement_floor_met',
    'usefulnessComponents': {
      'normalizedStrength': 0.2,
      'qualityScore': 0.12,
      'interestRelevanceScore': 0.24,
      'engagementIntegrityScore': 0.08,
      'freshness': 0.02,
      'total': 0.66,
    },
    'supportFacts': <Object?>[],
    'citationIds': ['citation-1'],
    'providerCount': 1,
    'confidence': 0.8,
    'canonicalDedupeOutcome': 'retained',
    'capOutcome': 'selected',
    'storyClusterId': 'cluster:release',
    'scoreComponents': score,
    'reasonCodes': ['reader_promotion_v2_admitted', 'top_slot_assigned'],
    'candidateDigestInput': candidateDigestInput,
    'slateEntryDigestInput': entryInput,
    'slateDigestInput': slateInput,
    'slateDigest': sha256.convert(utf8.encode(slateInput)).toString(),
    'evidenceLineage': {
      'leadCandidateId': 'candidate-top',
      'leadCitationId': 'citation-1',
      'supportCandidateIds': <Object?>[],
      'supportCitationIds': <Object?>[],
      'citationIds': ['citation-1'],
    },
  };
}
