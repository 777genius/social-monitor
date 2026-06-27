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

  test(
    'maps generated ReaderSummary reader payload into reader summary DTO',
    () {
      const mapper = GeneratedSummaryRestMapper();

      final readerSummary = mapper.readerSummary(_readerSummaryArtifact());

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
      expect(
        readerSummary.content.topReads.single.providerName,
        'GitHub Trending',
      );
      expect(
        readerSummary.content.topReads.single.primaryActionKind,
        'watch_repository',
      );
      expect(readerSummary.content.topReads.single.matchedTopicIds, [
        'ai-tools',
      ]);
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
      expect(readerSummary.period.cadence, 'daily');
    },
  );

  test('maps generated ReaderSummary job request and status DTOs', () {
    const mapper = GeneratedSummaryRestMapper();
    final requested = mapper.requestedReaderSummaryJob(
      generated.RequestReaderSummaryResponseDto(
        readerSummaryJobId: 'readerSummary-job-1',
        created: true,
        period: _readerSummaryPeriod(),
        status: generated.RequestReaderSummaryResponseDtoStatusStatus.requested,
      ),
    );

    expect(requested.id, 'readerSummary-job-1');
    expect(requested.status, 'requested');
    expect(requested.created, isTrue);

    final completedAt = DateTime.utc(2026, 6, 23, 10);
    final status = mapper.readerSummaryJobStatus(
      generated.ReaderSummaryJobStatusResponseDto(
        readerSummaryId: 'readerSummary-1',
        readerSummaryJobId: 'readerSummary-job-1',
        completedAt: completedAt,
        requestedAt: completedAt.subtract(const Duration(minutes: 1)),
        period: _readerSummaryPeriod(),
        scope: const generated.ReaderSummaryScopeDto(
          type: generated.ReaderSummaryScopeDtoTypeType.workspace,
        ),
        status:
            generated.ReaderSummaryJobStatusResponseDtoStatusStatus.completed,
        timeline: const [],
      ),
    );

    expect(status.status, 'completed');
    expect(status.summaryId, 'readerSummary-1');
    expect(status.completedAt, completedAt);
    expect(status.period?.cadence, 'daily');
  });
}

generated.ReaderSummaryPeriodDto _readerSummaryPeriod() {
  return generated.ReaderSummaryPeriodDto(
    cadence: generated.ReaderSummaryPeriodDtoCadenceCadence.daily,
    startedAt: DateTime.utc(2026, 6, 22),
    endedAt: DateTime.utc(2026, 6, 23),
    timezone: 'UTC',
    periodKey: 'daily:2026-06-22T00:00:00.000Z:2026-06-23T00:00:00.000Z:UTC',
  );
}

generated.ReaderSummaryArtifactResponseDto _readerSummaryArtifact() {
  final now = DateTime.utc(2026, 6, 23, 10, 30);
  return generated.ReaderSummaryArtifactResponseDto(
    readerSummaryId: 'readerSummary-1',
    citations: const [
      generated.ReaderSummaryCitationViewDto(
        canonicalUrl: 'https://github.com/calesthio/OpenMontage',
        citationId: 'bc-1',
        feedItemId: 'feed-1',
        field: generated.ReaderSummaryCitationViewDtoFieldField.title,
        label: '[1]',
        providerKey: 'github-trending-page',
        sourceItemId: 'source-1',
      ),
    ],
    confidence: const generated.ReaderSummaryConfidenceDto(
      level: generated.ReaderSummaryConfidenceDtoLevelLevel.medium,
      rationale: 'Enough evidence for a readerSummary.',
      score: 0.7,
    ),
    contextArtifacts: const [],
    executiveSummary:
        'GitHub Trending found concrete AI developer-tool repositories.',
    freshness: generated.ReaderSummaryFreshnessDto(
      checkedAt: now,
      status: generated.ReaderSummaryFreshnessDtoStatusStatus.fresh,
    ),
    headline: 'AI signal readerSummary',
    period: _readerSummaryPeriod(),
    lineage: const generated.ReaderSummaryLineageDto(
      evalDatasetVersion: 'reader_summary.eval.mvp.v1',
      modelVersion: 'deterministic-local',
      promptVersion: 'reader_summary.prompt.v1',
      providerVersion: 'deterministic-local',
      rulesVersion: 'reader_summary.rules.policy.v1',
      schemaVersion: 'reader_summary.artifact.v1',
    ),
    qualityFlags: const [],
    readerBrief: const generated.ReaderSummaryReaderBriefDto(
      headline: 'GitHub daily radar',
      oneLineTakeaway:
          'calesthio/OpenMontage is the clearest repository signal.',
      bullets: ['calesthio/OpenMontage is worth reading first.'],
      qualityState: generated.ReaderSummaryReaderQualityStateDto(
        status: generated
            .ReaderSummaryReaderQualityStateDtoStatusStatus
            .limitedSources,
        flags: [
          generated.ReaderSummaryReaderQualityStateDtoFlagsFlags.limitedSources,
        ],
        warnings: ['Source coverage is limited or single-source.'],
        isSingleSource: true,
      ),
      topicSections: [
        generated.ReaderSummaryReaderTopicSectionDto(
          title: 'AI developer tools',
          insight: 'Agent tooling repositories are gaining attention.',
          items: [
            generated.ReaderSummaryReaderItemDto(
              title: 'calesthio/OpenMontage',
              providerKey: 'github-trending-page',
              providerName: 'GitHub Trending',
              primaryActionKind: generated
                  .ReaderSummaryReaderItemDtoPrimaryActionKindPrimaryActionKind
                  .watchRepository,
              reason: '#1 on github.com/trending today.',
              matchedTopicIds: ['ai-tools'],
              matchedRules: ['topic:ai-tools', 'provider:github-trending-page'],
              signalScore: 1,
              confidence: generated.ReaderSummaryReaderItemConfidenceDto(
                level: generated
                    .ReaderSummaryReaderItemConfidenceDtoLevelLevel
                    .medium,
                score: 0.57,
                rationale: 'Daily GitHub Trending signal with raw metrics.',
              ),
              confirmedProviderKeys: ['github-trending-page'],
              providerMetrics: [
                generated.ReaderSummaryProviderMetricDto(
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
        generated.ReaderSummarySourceMixEntryDto(
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
        generated.ReaderSummaryReaderItemDto(
          title: 'calesthio/OpenMontage',
          providerKey: 'github-trending-page',
          providerName: 'GitHub Trending',
          primaryActionKind: generated
              .ReaderSummaryReaderItemDtoPrimaryActionKindPrimaryActionKind
              .watchRepository,
          reason: '#1 on github.com/trending today.',
          matchedTopicIds: ['ai-tools'],
          matchedRules: ['topic:ai-tools', 'provider:github-trending-page'],
          signalScore: 1,
          confidence: generated.ReaderSummaryReaderItemConfidenceDto(
            level:
                generated.ReaderSummaryReaderItemConfidenceDtoLevelLevel.medium,
            score: 0.57,
            rationale: 'Daily GitHub Trending signal with raw metrics.',
          ),
          confirmedProviderKeys: ['github-trending-page'],
          providerMetrics: [
            generated.ReaderSummaryProviderMetricDto(
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
      trendDelta: generated.ReaderSummaryTrendDeltaDto(
        newSignals: ['calesthio/OpenMontage'],
        growingSignals: [],
        repeatedSignals: [],
        fadingSignals: [],
      ),
      openQuestions: [],
      risks: [],
      nextActions: [
        generated.ReaderSummaryNextActionDto(
          kind: generated.ReaderSummaryNextActionDtoKindKind.watchRepository,
          label: 'Watch calesthio/OpenMontage',
          reason: 'Track whether growth continues.',
          canonicalUrl: 'https://github.com/calesthio/OpenMontage',
          citationIds: ['bc-1'],
        ),
      ],
    ),
    repeatedSignals: const [],
    risksAndUnknowns: const [],
    schemaVersion: 'reader_summary.artifact.v1',
    scope: const generated.ReaderSummaryScopeDto(
      type: generated.ReaderSummaryScopeDtoTypeType.workspace,
    ),
    sourceWindow: generated.ReaderSummarySourceWindowDto(
      endedAt: now,
      selectedFeedItemIds: const ['feed-1'],
      startedAt: now.subtract(const Duration(minutes: 30)),
      storyClusterIds: const ['story-1'],
      windowId: 'window-1',
    ),
    storyClusters: [
      generated.ReaderSummaryStoryClusterDto(
        duplicateFeedItemIds: const [],
        id: 'story-1',
        observedAtRange: generated.ReaderSummaryObservedAtRangeDto(
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
      generated.ReaderSummaryTopStoryDto(
        citationIds: ['bc-1'],
        providerKeys: ['github-trending-page'],
        storyClusterId: 'story-1',
        summary: 'calesthio/OpenMontage is gaining attention.',
        title: 'calesthio/OpenMontage',
        topicIds: ['ai-tools'],
      ),
    ],
    usage: const generated.ReaderSummaryUsageDto(
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
