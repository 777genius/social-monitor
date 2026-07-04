part of 'summary_api_dto.dart';

final class SummaryClaimEvidenceApiDto {
  const SummaryClaimEvidenceApiDto({
    required this.title,
    required this.providerKey,
    required this.citationId,
    this.canonicalUrl,
  });

  final String title;
  final String providerKey;
  final String citationId;
  final String? canonicalUrl;
}

final class SummaryClaimRiskApiDto {
  const SummaryClaimRiskApiDto({required this.kind, required this.description});

  final String kind;
  final String description;
}

final class SummaryClaimApiDto {
  const SummaryClaimApiDto({
    required this.claim,
    required this.evidence,
    required this.confidence,
    required this.risks,
    required this.citationIds,
  });

  final String claim;
  final List<SummaryClaimEvidenceApiDto> evidence;
  final TopReadConfidenceApiDto confidence;
  final List<SummaryClaimRiskApiDto> risks;
  final List<String> citationIds;
}

final class SummaryReliabilityRiskApiDto {
  const SummaryReliabilityRiskApiDto({
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

final class SummaryReliabilityReportApiDto {
  const SummaryReliabilityReportApiDto({
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
  final List<SummaryReliabilityRiskApiDto> risks;
}

const emptySummaryReliabilityReportApiDto = SummaryReliabilityReportApiDto(
  mode: 'shadow',
  policyVersion: 'reader_summary_reliability_shadow_v1',
  riskLevel: 'low',
  riskScore: 0,
  risks: [],
);
