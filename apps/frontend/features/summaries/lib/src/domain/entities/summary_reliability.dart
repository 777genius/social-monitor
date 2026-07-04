final class SummaryReliabilityRisk {
  const SummaryReliabilityRisk({
    required this.kind,
    required this.level,
    required this.score,
    required this.description,
  });

  final String kind;
  final String level;
  final double score;
  final String description;
}

final class SummaryReliabilityReport {
  const SummaryReliabilityReport({
    required this.mode,
    required this.policyVersion,
    required this.riskLevel,
    required this.riskScore,
    required this.risks,
  });

  final String mode;
  final String policyVersion;
  final String riskLevel;
  final double riskScore;
  final List<SummaryReliabilityRisk> risks;
}

const emptySummaryReliabilityReport = SummaryReliabilityReport(
  mode: 'shadow',
  policyVersion: 'reader_summary_reliability_shadow_v1',
  riskLevel: 'low',
  riskScore: 0,
  risks: [],
);
