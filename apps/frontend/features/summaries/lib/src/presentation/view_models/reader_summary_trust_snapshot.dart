import '../../domain/aggregates/reader_summary.dart';

final class ReaderSummaryTrustSnapshot {
  const ReaderSummaryTrustSnapshot({
    required this.confidenceLevel,
    required this.confidenceScore,
    required this.providerCount,
    required this.needsConfirmation,
  });

  final String confidenceLevel;
  final double confidenceScore;
  final int providerCount;
  final bool needsConfirmation;

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
    final providerCount = uniqueTrustEvidenceProviders(
      claims.expand((claim) => claim.evidence),
    ).length;
    final riskKinds = {
      ...claims.expand((claim) => claim.risks.map((risk) => risk.kind)),
      ...report.risks.map((risk) => risk.kind),
    };

    final confidenceLevel = confidences.isEmpty
        ? confidenceLevelForScore(confidenceScore)
        : lowestConfidenceLevel(confidences.map((item) => item.level));

    return ReaderSummaryTrustSnapshot(
      confidenceLevel: confidenceLevel,
      confidenceScore: confidenceScore,
      providerCount: providerCount,
      needsConfirmation:
          confidenceLevel == 'low' ||
          confidenceScore < 0.5 ||
          providerCount <= 1 ||
          riskKinds.contains('single_source') ||
          riskKinds.contains('low_confidence') ||
          riskKinds.contains('weak_source') ||
          riskKinds.contains('low_evidence_diversity'),
    );
  }
}

Set<String> uniqueTrustEvidenceProviders(
  Iterable<SummaryClaimEvidence> evidence,
) {
  return {
    for (final item in evidence)
      if (item.providerKey.trim().isNotEmpty) item.providerKey.trim(),
  };
}

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
