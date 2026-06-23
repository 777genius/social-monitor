import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_summaries/src/infrastructure/mappers/generated_summary_rest_mapper.dart';

void main() {
  test('maps generated summary artifact into feature DTO', () {
    const mapper = GeneratedSummaryRestMapper();

    final page = mapper.list(
      generated.ListSummariesResponseDto(items: [_summaryArtifact()]),
    );

    expect(page.items, hasLength(1));
    expect(page.items.single.id, 'summary-1');
    expect(page.items.single.title, 'AI library trend pulse');
    expect(page.items.single.status, 'ready');
    expect(page.items.single.bodyText, contains('20 selected item'));
    expect(page.items.single.bodyText, contains('LangGraph release velocity'));
    expect(page.items.single.citations.single.sourceLabel, 'github [1]');
    expect(
      page.items.single.citations.single.rawSnippet,
      'Evidence field title from source item source-item-1',
    );
    expect(page.items.single.freshnessLabel, 'Fresh');
  });

  test('maps generated briefing job request and status DTOs', () {
    const mapper = GeneratedSummaryRestMapper();
    final requested = mapper.requestedBriefingJob(
      const generated.RequestBriefingResponseDto(
        briefingJobId: 'briefing-job-1',
        created: true,
        status: generated.RequestBriefingResponseDtoStatusStatus.requested,
      ),
    );

    expect(requested.id, 'briefing-job-1');
    expect(requested.status, 'requested');
    expect(requested.created, isTrue);

    final completedAt = DateTime.utc(2026, 6, 23, 10);
    final status = mapper.briefingJobStatus(
      generated.BriefingJobStatusResponseDto(
        briefingId: 'briefing-1',
        briefingJobId: 'briefing-job-1',
        completedAt: completedAt,
        requestedAt: completedAt.subtract(const Duration(minutes: 1)),
        scope: const generated.BriefingScopeDto(
          type: generated.BriefingScopeDtoTypeType.workspace,
        ),
        status: generated.BriefingJobStatusResponseDtoStatusStatus.completed,
        timeline: const [],
      ),
    );

    expect(status.status, 'completed');
    expect(status.briefingId, 'briefing-1');
    expect(status.completedAt, completedAt);
  });
}

generated.SummaryArtifactResponseDto _summaryArtifact() {
  final now = DateTime.utc(2026, 6, 23, 9, 50);
  return generated.SummaryArtifactResponseDto(
    citations: const [
      generated.SummaryCitationViewDto(
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
    executiveSummary: 'Current executive brief uses 20 selected item(s).',
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
    topicId: 'topic-1',
    usage: const generated.SummaryUsageDto(
      estimatedCostUsd: 0,
      inputTokens: 100,
      outputTokens: 40,
    ),
    workspaceId: 'workspace-1',
  );
}
