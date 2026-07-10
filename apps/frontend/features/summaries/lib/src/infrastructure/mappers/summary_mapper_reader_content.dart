part of 'summary_mapper.dart';

extension on SummaryMapper {
  ReaderSummaryContent _readerSummaryContentToDomain(
    ReaderSummaryContentApiDto dto,
  ) {
    return ReaderSummaryContent(
      headline: _nonEmpty(dto.headline, fallback: 'Workspace summary'),
      oneLineTakeaway: _safeLongText(
        dto.oneLineTakeaway,
        fallback: 'No summary takeaway available',
      ),
      bullets: _safeTextList(dto.bullets),
      narrativeSections: dto.narrativeSections
          .map(
            (section) => ReaderSummaryNarrativeSection(
              id: _nonEmpty(section.id, fallback: 'narrative-section'),
              kind: _narrativeSectionKind(section.kind),
              title: _safeText(section.title, fallback: 'Signal'),
              text: _safeLongText(
                section.text,
                fallback: 'No narrative detail available',
              ),
              citationIds: _safeTextList(section.citationIds),
              storyClusterId: _nonEmptyOrNull(section.storyClusterId),
            ),
          )
          .toList(growable: false),
      mainTopics: _safeTextList(dto.mainTopics),
      topicMap: _topicMapToDomain(this, dto.topicMap),
      qualityState: ReaderSummaryQualityState(
        status: _nonEmpty(dto.qualityState.status, fallback: 'ready'),
        flags: _safeTextList(dto.qualityState.flags),
        warnings: _safeTextList(dto.qualityState.warnings),
        isSingleSource: dto.qualityState.isSingleSource,
      ),
      interestSections: dto.interestSections
          .map(_interestSectionToDomain)
          .toList(growable: false),
      sourceMix: dto.sourceMix.map(_sourceMixToDomain).toList(growable: false),
      topReads: dto.topReads.map(_readerItemToDomain).toList(growable: false),
      selectedPosts: dto.selectedPosts
          .map(_readerItemToDomain)
          .toList(growable: false),
      claimBoard: dto.claimBoard
          .map((claim) => _summaryClaimToDomain(this, claim))
          .toList(growable: false),
      reliabilityReport: _summaryReliabilityToDomain(
        this,
        dto.reliabilityReport,
      ),
      trendDelta: ReaderTrendDelta(
        newSignals: _safeTextList(dto.trendDelta.newSignals),
        growingSignals: _safeTextList(dto.trendDelta.growingSignals),
        repeatedSignals: _safeTextList(dto.trendDelta.repeatedSignals),
        fadingSignals: _safeTextList(dto.trendDelta.fadingSignals),
      ),
      openQuestions: _safeTextList(dto.openQuestions),
      risks: _safeTextList(dto.risks),
      nextActions: dto.nextActions
          .map(_nextActionToDomain)
          .toList(growable: false),
    );
  }
}

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
    id: mapper._nonEmptyOrNull(dto.id),
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
