part of 'generated_summary_rest_mapper_test.dart';

generated.SummaryArtifactResponseDto _summaryArtifact() {
  final now = DateTime.utc(2026, 6, 23, 9, 50);
  return generated.SummaryArtifactResponseDto(
    citations: const [
      generated.SummaryCitationViewDto(
        canonicalUrl: 'https://github.com/openai/codex',
        citationId: 'c1',
        feedItemId: 'feed-item-1',
        field: generated.SummaryCitationViewDtoFieldField.title,
        label: '[1]',
        providerKey: 'github',
        sourceItemId: 'source-item-1',
      ),
    ],
    confidence: const generated.SummaryConfidenceDto(
      level: generated.SummaryConfidenceDtoLevelLevel.medium,
      rationale: 'Enough evidence for MVP summary',
      score: 0.7,
    ),
    executiveSummary: 'Current executive summary uses 20 selected item(s).',
    freshness: generated.SummaryFreshnessDto(
      checkedAt: now,
      status: generated.SummaryFreshnessDtoStatusStatus.fresh,
    ),
    headline: 'AI library trend pulse',
    keyPoints: const [
      generated.SummaryKeyPointDto(
        citationIds: ['c1'],
        claim: 'LangGraph release velocity increased.',
      ),
    ],
    lineage: const generated.SummaryLineageDto(
      evalDatasetVersion: 'summary.eval.mvp.v1',
      modelVersion: 'deterministic-local',
      promptVersion: 'summary.prompt.v1',
      providerVersion: 'deterministic-local',
      rulesVersion: 'summary.rules.policy.v1',
      schemaVersion: 'summary.artifact.v1',
    ),
    qualityFlags: const [],
    risksAndUnknowns: const [],
    schemaVersion: 'summary.artifact.v1',
    sourceHighlights: const ['GitHub issues are the dominant source.'],
    sourceWindow: generated.SummarySourceWindowDto(
      endedAt: now,
      selectedFeedItemIds: const ['feed-item-1'],
      startedAt: now.subtract(const Duration(minutes: 30)),
      windowId: 'window-1',
    ),
    summaryId: 'summary-1',
    tenantId: 'tenant-1',
    interestId: 'topic-1',
    usage: const generated.SummaryUsageDto(
      estimatedCostUsd: 0,
      inputTokens: 100,
      outputTokens: 40,
    ),
    workspaceId: 'workspace-1',
  );
}
