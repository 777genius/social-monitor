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
    expect(page.items.single.citations.single.sourceLabel, 'GitHub [1]');
    expect(
      page.items.single.citations.single.canonicalUrl,
      'https://github.com/openai/codex',
    );
    expect(
      page.items.single.citations.single.rawSnippet,
      'GitHub citation references title evidence from source item source-item-1.',
    );
    expect(page.items.single.freshnessLabel, 'Fresh');
  });

  test('maps generated Briefing reader payload into reader summary DTO', () {
    const mapper = GeneratedSummaryRestMapper();

    final readerSummary = mapper.readerSummary(_briefingArtifact());

    expect(readerSummary.content.headline, 'GitHub daily radar');
    expect(
      readerSummary.content.oneLineTakeaway,
      contains('calesthio/OpenMontage'),
    );
    expect(readerSummary.content.qualityState.status, 'limited_sources');
    expect(
      readerSummary.content.topReads.single.canonicalUrl,
      contains('github.com/calesthio/OpenMontage'),
    );
    expect(readerSummary.content.topReads.single.matchedTopicIds, ['ai-tools']);
    expect(
      readerSummary.content.topReads.single.providerMetrics.single.value,
      '#1, +3,703 stars today',
    );
    expect(
      readerSummary.content.sourceMix.single.providerKey,
      'github-trending-page',
    );
    expect(readerSummary.content.sourceMix.single.storyClusterCount, 1);
    expect(readerSummary.content.nextActions.single.kind, 'watch_repository');
  });

  test('maps generated Briefing job request and status DTOs', () {
    const mapper = GeneratedSummaryRestMapper();
    final requested = mapper.requestedReaderSummaryJob(
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
    final status = mapper.readerSummaryJobStatus(
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
    expect(status.summaryId, 'briefing-1');
    expect(status.completedAt, completedAt);
  });
}

generated.BriefingArtifactResponseDto _briefingArtifact() {
  final now = DateTime.utc(2026, 6, 23, 10, 30);
  return generated.BriefingArtifactResponseDto(
    briefingId: 'briefing-1',
    citations: const [
      generated.BriefingCitationViewDto(
        canonicalUrl: 'https://github.com/calesthio/OpenMontage',
        citationId: 'bc-1',
        feedItemId: 'feed-1',
        field: generated.BriefingCitationViewDtoFieldField.title,
        label: '[1]',
        providerKey: 'github-trending-page',
        sourceItemId: 'source-1',
      ),
    ],
    confidence: const generated.BriefingConfidenceDto(
      level: generated.BriefingConfidenceDtoLevelLevel.medium,
      rationale: 'Enough evidence for a briefing.',
      score: 0.7,
    ),
    contextArtifacts: const [],
    executiveSummary:
        'GitHub Trending found concrete AI developer-tool repositories.',
    freshness: generated.BriefingFreshnessDto(
      checkedAt: now,
      status: generated.BriefingFreshnessDtoStatusStatus.fresh,
    ),
    headline: 'AI signal briefing',
    lineage: const generated.BriefingLineageDto(
      evalDatasetVersion: 'briefing.eval.mvp.v1',
      modelVersion: 'deterministic-local',
      promptVersion: 'briefing.prompt.v1',
      providerVersion: 'deterministic-local',
      rulesVersion: 'briefing.rules.policy.v1',
      schemaVersion: 'briefing.artifact.v1',
    ),
    qualityFlags: const [],
    readerBrief: const generated.BriefingReaderBriefDto(
      headline: 'GitHub daily radar',
      oneLineTakeaway:
          'calesthio/OpenMontage is the clearest repository signal.',
      bullets: ['calesthio/OpenMontage is worth reading first.'],
      qualityState: generated.BriefingReaderQualityStateDto(
        status:
            generated.BriefingReaderQualityStateDtoStatusStatus.limitedSources,
        flags: [
          generated.BriefingReaderQualityStateDtoFlagsFlags.limitedSources,
        ],
        warnings: ['Source coverage is limited or single-source.'],
        isSingleSource: true,
      ),
      topicSections: [
        generated.BriefingReaderTopicSectionDto(
          title: 'AI developer tools',
          insight: 'Agent tooling repositories are gaining attention.',
          items: [
            generated.BriefingReaderItemDto(
              title: 'calesthio/OpenMontage',
              providerKey: 'github-trending-page',
              reason: '#1 on github.com/trending today.',
              matchedTopicIds: ['ai-tools'],
              matchedRules: ['topic:ai-tools', 'provider:github-trending-page'],
              signalScore: 1,
              confidence: generated.BriefingReaderItemConfidenceDto(
                level:
                    generated.BriefingReaderItemConfidenceDtoLevelLevel.medium,
                score: 0.57,
                rationale: 'Daily GitHub Trending signal with raw metrics.',
              ),
              confirmedProviderKeys: ['github-trending-page'],
              providerMetrics: [
                generated.BriefingProviderMetricDto(
                  label: 'GitHub Trending today',
                  value: '#1, +3,703 stars today',
                ),
              ],
              whyImportant: ['It is #1 on GitHub Trending today.'],
              whyNow:
                  'Current summary window has github.com/trending page coverage.',
              canonicalUrl: 'https://github.com/calesthio/OpenMontage',
              citationIds: ['bc-1'],
            ),
          ],
          citationIds: ['bc-1'],
        ),
      ],
      sourceMix: [
        generated.BriefingSourceMixEntryDto(
          providerKey: 'github-trending-page',
          itemCount: 1,
          citationCount: 1,
          storyClusterCount: 1,
          crossSourceClusterCount: 0,
          singleSourceOnly: true,
          topicIds: ['ai-tools'],
        ),
      ],
      topReads: [
        generated.BriefingReaderItemDto(
          title: 'calesthio/OpenMontage',
          providerKey: 'github-trending-page',
          reason: '#1 on github.com/trending today.',
          matchedTopicIds: ['ai-tools'],
          matchedRules: ['topic:ai-tools', 'provider:github-trending-page'],
          signalScore: 1,
          confidence: generated.BriefingReaderItemConfidenceDto(
            level: generated.BriefingReaderItemConfidenceDtoLevelLevel.medium,
            score: 0.57,
            rationale: 'Daily GitHub Trending signal with raw metrics.',
          ),
          confirmedProviderKeys: ['github-trending-page'],
          providerMetrics: [
            generated.BriefingProviderMetricDto(
              label: 'GitHub Trending today',
              value: '#1, +3,703 stars today',
            ),
          ],
          whyImportant: ['It is #1 on GitHub Trending today.'],
          whyNow:
              'Current summary window has github.com/trending page coverage.',
          canonicalUrl: 'https://github.com/calesthio/OpenMontage',
          citationIds: ['bc-1'],
        ),
      ],
      trendDelta: generated.BriefingTrendDeltaDto(
        newSignals: ['calesthio/OpenMontage'],
        growingSignals: [],
        repeatedSignals: [],
        fadingSignals: [],
      ),
      openQuestions: [],
      risks: [],
      nextActions: [
        generated.BriefingNextActionDto(
          kind: generated.BriefingNextActionDtoKindKind.watchRepository,
          label: 'Watch calesthio/OpenMontage',
          reason: 'Track whether growth continues.',
          canonicalUrl: 'https://github.com/calesthio/OpenMontage',
          citationIds: ['bc-1'],
        ),
      ],
    ),
    repeatedSignals: const [],
    risksAndUnknowns: const [],
    schemaVersion: 'briefing.artifact.v1',
    scope: const generated.BriefingScopeDto(
      type: generated.BriefingScopeDtoTypeType.workspace,
    ),
    sourceWindow: generated.BriefingSourceWindowDto(
      endedAt: now,
      selectedFeedItemIds: const ['feed-1'],
      startedAt: now.subtract(const Duration(minutes: 30)),
      storyClusterIds: const ['story-1'],
      windowId: 'window-1',
    ),
    storyClusters: [
      generated.BriefingStoryClusterDto(
        duplicateFeedItemIds: const [],
        id: 'story-1',
        observedAtRange: generated.BriefingObservedAtRangeDto(
          endedAt: now,
          startedAt: now.subtract(const Duration(minutes: 30)),
        ),
        providerKeys: const ['github-trending-page'],
        representativeFeedItemId: 'feed-1',
        score: 1,
        storyKey: 'url:github.com/calesthio/OpenMontage',
        topicIds: const ['ai-tools'],
        whyImportant: const ['Fast star growth.'],
      ),
    ],
    tenantId: 'tenant-1',
    topicHighlights: const [],
    topStories: const [
      generated.BriefingTopStoryDto(
        citationIds: ['bc-1'],
        providerKeys: ['github-trending-page'],
        storyClusterId: 'story-1',
        summary: 'calesthio/OpenMontage is gaining attention.',
        title: 'calesthio/OpenMontage',
        topicIds: ['ai-tools'],
      ),
    ],
    usage: const generated.BriefingUsageDto(
      estimatedCostUsd: 0,
      inputTokens: 100,
      outputTokens: 40,
    ),
    workspaceId: 'workspace-1',
  );
}

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
