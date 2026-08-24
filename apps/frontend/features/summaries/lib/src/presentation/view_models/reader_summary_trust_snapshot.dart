import '../../domain/aggregates/reader_summary.dart';
import '../../domain/value_objects/reader_summary_provider_family.dart';

final class ReaderSummaryTrustSnapshot {
  const ReaderSummaryTrustSnapshot({
    required this.confidenceLevel,
    required this.confidenceScore,
    required this.sourceGroupCount,
    required this.needsConfirmation,
    required this.hasMixedConfidence,
  });

  final String confidenceLevel;
  final double confidenceScore;
  final int sourceGroupCount;
  final bool needsConfirmation;
  final bool hasMixedConfidence;

  factory ReaderSummaryTrustSnapshot.from({
    required List<SummaryClaim> claims,
    required SummaryReliabilityReport report,
  }) {
    final confidences = claims.map((claim) => claim.confidence).toList();
    final confidenceScore = confidences.isEmpty
        ? (1 - report.riskScore).clamp(0, 1).toDouble()
        : confidences
              .map((confidence) => confidence.score.clamp(0, 1).toDouble())
              .reduce((left, right) => left < right ? left : right);
    final sourceGroupCount = uniqueTrustEvidenceSourceGroups(
      claims.expand((claim) => claim.evidence),
    ).length;
    final riskKinds = {
      ...claims.expand((claim) => claim.risks.map((risk) => risk.kind)),
      ...report.risks.map((risk) => risk.kind),
    };
    final hasSingleSourceClaim = claims.any(
      (claim) => uniqueTrustEvidenceSourceGroups(claim.evidence).length <= 1,
    );

    final confidenceLevels = confidences.map((item) => item.level).toSet();
    final confidenceLevel = confidences.isEmpty
        ? confidenceLevelForScore(confidenceScore)
        : lowestConfidenceLevel(confidenceLevels);

    return ReaderSummaryTrustSnapshot(
      confidenceLevel: confidenceLevel,
      confidenceScore: confidenceScore,
      sourceGroupCount: sourceGroupCount,
      needsConfirmation:
          confidenceLevel == 'low' ||
          confidenceScore < 0.5 ||
          sourceGroupCount <= 1 ||
          hasSingleSourceClaim ||
          riskKinds.contains('single_source') ||
          riskKinds.contains('low_confidence') ||
          riskKinds.contains('unresolved') ||
          riskKinds.contains('weak_source') ||
          riskKinds.contains('low_evidence_diversity'),
      hasMixedConfidence: confidenceLevels.length > 1,
    );
  }
}

Set<String> uniqueTrustEvidenceSourceGroups(
  Iterable<SummaryClaimEvidence> evidence,
) => readerSummaryIndependentProviderFamilies(
  evidence.map((item) => item.providerKey),
);

String lowestConfidenceLevel(Iterable<String> levels) {
  if (levels.contains('low')) {
    return 'low';
  }
  if (levels.contains('medium')) {
    return 'medium';
  }
  return 'high';
}

String confidenceLevelForScore(double score) {
  if (score >= 0.72) {
    return 'high';
  }
  if (score >= 0.5) {
    return 'medium';
  }
  return 'low';
}
