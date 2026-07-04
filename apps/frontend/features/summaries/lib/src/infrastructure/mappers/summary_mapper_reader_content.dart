part of 'summary_mapper.dart';

SummaryReliabilityReport _summaryReliabilityToDomain(
  SummaryMapper mapper,
  SummaryReliabilityReportApiDto dto,
) {
  return SummaryReliabilityReport(
    mode: mapper._nonEmpty(dto.mode, fallback: 'shadow'),
    policyVersion: mapper._nonEmpty(
      dto.policyVersion,
      fallback: 'reader_summary_reliability_shadow_v1',
    ),
    riskLevel: mapper._readerItemConfidenceLevel(dto.riskLevel),
    riskScore: mapper._boundedScore(dto.riskScore),
    risks: dto.risks
        .map(
          (risk) => SummaryReliabilityRisk(
            kind: mapper._nonEmpty(
              risk.kind,
              fallback: 'low_evidence_diversity',
            ),
            level: mapper._readerItemConfidenceLevel(risk.level),
            score: mapper._boundedScore(risk.score),
            description: mapper._safeText(
              risk.description,
              fallback: 'Evidence quality needs review.',
            ),
          ),
        )
        .toList(growable: false),
  );
}

SummaryClaim _summaryClaimToDomain(
  SummaryMapper mapper,
  SummaryClaimApiDto dto,
) {
  return SummaryClaim(
    claim: mapper._safeText(dto.claim, fallback: 'Unlabeled claim'),
    evidence: dto.evidence
        .map(
          (evidence) => SummaryClaimEvidence(
            title: mapper._safeText(evidence.title, fallback: dto.claim),
            providerKey: mapper._nonEmpty(
              evidence.providerKey,
              fallback: 'unknown',
            ),
            citationId: mapper._nonEmpty(
              evidence.citationId,
              fallback: 'unknown',
            ),
            canonicalUrl: mapper._safeUrl(evidence.canonicalUrl),
          ),
        )
        .toList(growable: false),
    confidence: TopReadConfidence(
      level: mapper._readerItemConfidenceLevel(dto.confidence.level),
      score: mapper._boundedScore(dto.confidence.score),
      rationale: mapper._safeText(
        dto.confidence.rationale,
        fallback: 'Confidence inferred from cited evidence.',
      ),
    ),
    risks: dto.risks
        .map(
          (risk) => SummaryClaimRisk(
            kind: mapper._nonEmpty(risk.kind, fallback: 'unresolved'),
            description: mapper._safeText(
              risk.description,
              fallback: 'Needs confirmation.',
            ),
          ),
        )
        .toList(growable: false),
    citationIds: mapper._safeTextList(dto.citationIds),
  );
}
