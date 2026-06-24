import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/summary_citation.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_generation_status.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_id.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

const summaryWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-demo',
  workspaceId: 'workspace-demo',
);

SummaryCitationApiDto summaryCitationApiDto({
  String id = 'c-1',
  String sourceLabel = 'Reddit thread',
  String rawSnippet = 'Users compared competitor pricing tiers.',
  String? canonicalUrl,
}) {
  return SummaryCitationApiDto(
    id: id,
    sourceLabel: sourceLabel,
    rawSnippet: rawSnippet,
    canonicalUrl: canonicalUrl,
  );
}

SummaryApiDto summaryApiDto({
  String id = 's-1',
  String title = 'Weekly risk summary',
  String status = 'ready',
  String bodyText =
      'Pricing pressure increased while launch sentiment stayed stable.',
  List<SummaryCitationApiDto>? citations,
  String freshnessLabel = 'Today',
  bool feedbackSubmitted = false,
}) {
  return SummaryApiDto(
    id: id,
    title: title,
    status: status,
    bodyText: bodyText,
    citations: citations ?? [summaryCitationApiDto()],
    freshnessLabel: freshnessLabel,
    feedbackSubmitted: feedbackSubmitted,
  );
}

BriefingApiDto briefingApiDto({
  String id = 'briefing-1',
  String title = 'AI workspace summary',
  String executiveSummary =
      'AI model launches and developer tooling changes are the strongest signals.',
  String? userId = 'user-demo',
  BriefingReaderBriefApiDto? readerBrief,
  List<BriefingStoryApiDto> topStories = const [
    BriefingStoryApiDto(
      title: 'New AI coding tools gain adoption',
      summary: 'Developers discussed new agent workflows and IDE support.',
      topicCount: 2,
      providerCount: 3,
      citationIds: ['bc-1'],
    ),
  ],
  List<BriefingRepeatedSignalApiDto> repeatedSignals = const [],
  List<SummaryCitationApiDto>? citations,
  String freshnessLabel = 'Fresh',
  bool isDegraded = false,
}) {
  return BriefingApiDto(
    id: id,
    title: title,
    executiveSummary: executiveSummary,
    userId: userId,
    readerBrief: readerBrief ?? briefingReaderBriefApiDto(),
    topStories: topStories,
    repeatedSignals: repeatedSignals,
    citations: citations ?? [summaryCitationApiDto(id: 'bc-1')],
    freshnessLabel: freshnessLabel,
    isDegraded: isDegraded,
  );
}

BriefingReaderBriefApiDto briefingReaderBriefApiDto({
  String headline = 'AI workspace summary',
  String oneLineTakeaway =
      'New AI coding tools are the clearest signal to inspect first.',
  List<BriefingReaderItemApiDto> topReads = const [
    BriefingReaderItemApiDto(
      title: 'AI coding tools',
      providerKey: 'github-repo-radar',
      reason: 'Developers discussed new agent workflows and IDE support.',
      matchedTopicIds: ['ai-developer-tools'],
      matchedRules: ['topic:ai-developer-tools', 'provider:github-repo-radar'],
      signalScore: 1,
      providerMetrics: [
        BriefingProviderMetricApiDto(label: 'Stars', value: '12,400'),
        BriefingProviderMetricApiDto(label: 'Trend', value: '+420 / 48h'),
      ],
      whyImportant: [
        'Developers discussed new agent workflows and IDE support.',
      ],
      whyNow: 'Current summary window has Repo Radar coverage.',
      canonicalUrl: 'https://github.com/example/ai-coding-tools',
      citationIds: ['bc-1'],
    ),
  ],
}) {
  return BriefingReaderBriefApiDto(
    headline: headline,
    oneLineTakeaway: oneLineTakeaway,
    bullets: const [
      'Best first read: AI coding tools because it is the strongest selected signal.',
    ],
    qualityState: const BriefingReaderQualityStateApiDto(
      status: 'limited_sources',
      flags: ['limited_sources'],
      warnings: ['Source coverage is limited or single-source.'],
      isSingleSource: true,
    ),
    topicSections: [
      BriefingTopicSectionApiDto(
        title: 'Developer tooling',
        insight: 'Agent workflows and IDE support are the main discussion.',
        items: topReads,
        citationIds: const ['bc-1'],
      ),
    ],
    sourceMix: [
      BriefingSourceMixEntryApiDto(
        providerKey: 'github-repo-radar',
        itemCount: topReads.length,
        citationCount: topReads.fold<int>(
          0,
          (count, item) => count + item.citationIds.length,
        ),
        storyClusterCount: topReads.length,
        crossSourceClusterCount: 0,
        singleSourceOnly: true,
        topicIds: const ['ai-developer-tools'],
      ),
    ],
    topReads: topReads,
    trendDelta: const BriefingTrendDeltaApiDto(
      newSignals: ['1 Repo Radar item selected'],
      growingSignals: ['Developer tooling'],
      repeatedSignals: [],
      fadingSignals: [],
    ),
    openQuestions: const [],
    risks: const [],
    nextActions: const [
      BriefingNextActionApiDto(
        kind: 'read_source',
        label: 'Read source',
        reason: 'Open the cited source behind this summary item.',
        canonicalUrl: 'https://github.com/openai/codex',
        citationIds: ['bc-1'],
      ),
      BriefingNextActionApiDto(
        kind: 'watch_repository',
        label: 'Watch AI coding tools',
        reason: 'Check whether the signal keeps growing.',
        canonicalUrl: 'https://github.com/example/ai-coding-tools',
        citationIds: ['bc-1'],
      ),
      BriefingNextActionApiDto(
        kind: 'mark_relevant',
        label: 'Mark relevant',
        reason: 'Use feedback to keep future summaries aligned.',
        canonicalUrl: 'https://github.com/example/ai-coding-tools',
        citationIds: ['bc-1'],
      ),
      BriefingNextActionApiDto(
        kind: 'mark_not_relevant',
        label: 'Not relevant',
        reason: 'Use feedback to reduce similar future signals.',
        canonicalUrl: 'https://github.com/example/ai-coding-tools',
        citationIds: ['bc-1'],
      ),
    ],
  );
}

GeneratedSummary generatedSummary({
  String id = 's-1',
  String title = 'Weekly risk summary',
  String bodyPreview =
      'Pricing pressure increased while launch sentiment stayed stable.',
  SummaryGenerationStatus status = SummaryGenerationStatus.ready,
  List<SummaryCitation> citations = const [
    SummaryCitation(
      id: 'c-1',
      sourceLabel: 'Reddit thread',
      safeSnippet: 'Users compared competitor pricing tiers.',
    ),
  ],
  String freshnessLabel = 'Today',
  bool feedbackSubmitted = false,
}) {
  return GeneratedSummary(
    id: SummaryId(id),
    title: title,
    bodyPreview: bodyPreview,
    status: status,
    citations: citations,
    freshnessLabel: freshnessLabel,
    feedbackSubmitted: feedbackSubmitted,
  );
}

SummaryApiDto repoRadarSummaryApiDto() {
  return summaryApiDto(
    title: 'GitHub repo radar summary',
    bodyText:
        'Repo Radar found openai/codex, firecrawl/firecrawl and langchain-ai/langgraph as the strongest AI developer-tool signals today.',
    citations: [
      summaryCitationApiDto(
        id: 'c-1',
        sourceLabel: 'Repo Radar [1] openai/codex',
        rawSnippet: '54.0k stars, +210 in 24h and +360 in 48h.',
        canonicalUrl: 'https://github.com/openai/codex',
      ),
      summaryCitationApiDto(
        id: 'c-2',
        sourceLabel: 'Repo Radar [2] firecrawl/firecrawl',
        rawSnippet:
            'Web data infrastructure project continues gaining developer attention.',
        canonicalUrl: 'https://github.com/firecrawl/firecrawl',
      ),
      summaryCitationApiDto(
        id: 'c-3',
        sourceLabel: 'Repo Radar [3] langchain-ai/langgraph',
        rawSnippet:
            'Agent graph orchestration remains a repeated topic in AI tooling feeds.',
        canonicalUrl: 'https://github.com/langchain-ai/langgraph',
      ),
    ],
  );
}

BriefingApiDto repoRadarBriefingApiDto() {
  return briefingApiDto(
    title: 'AI signal summary',
    executiveSummary:
        'GitHub Repo Radar found concrete AI developer-tool repositories worth reviewing today.',
    readerBrief: briefingReaderBriefApiDto(
      headline: 'AI repo radar',
      oneLineTakeaway:
          'Repo Radar found openai/codex as the strongest repository signal, without cross-source confirmation in this summary.',
      topReads: const [
        BriefingReaderItemApiDto(
          title: 'openai/codex',
          providerKey: 'github-repo-radar',
          reason: '54.0k stars, +210 in 24h and +360 in 48h.',
          matchedTopicIds: ['ai-developer-tools'],
          matchedRules: [
            'topic:ai-developer-tools',
            'provider:github-repo-radar',
          ],
          signalScore: 1,
          providerMetrics: [
            BriefingProviderMetricApiDto(label: 'Stars', value: '54,000'),
            BriefingProviderMetricApiDto(label: 'Trend', value: '+360 / 48h'),
          ],
          whyImportant: ['Repository is gaining stars quickly.'],
          whyNow: 'Current summary window has Repo Radar coverage.',
          canonicalUrl: 'https://github.com/openai/codex',
          citationIds: ['bc-1'],
        ),
        BriefingReaderItemApiDto(
          title: 'firecrawl/firecrawl',
          providerKey: 'github-repo-radar',
          reason:
              'Web data infrastructure project continues gaining developer attention.',
          matchedTopicIds: ['ai-developer-tools'],
          matchedRules: [
            'topic:ai-developer-tools',
            'provider:github-repo-radar',
          ],
          signalScore: 0.9,
          providerMetrics: [
            BriefingProviderMetricApiDto(label: 'Stars', value: '31,000'),
            BriefingProviderMetricApiDto(label: 'Trend', value: '+190 / 48h'),
          ],
          whyImportant: [
            'Web data infrastructure project continues gaining developer attention.',
          ],
          whyNow: 'Current summary window has Repo Radar coverage.',
          canonicalUrl: 'https://github.com/firecrawl/firecrawl',
          citationIds: ['bc-2'],
        ),
        BriefingReaderItemApiDto(
          title: 'langchain-ai/langgraph',
          providerKey: 'github-repo-radar',
          reason:
              'Agent graph orchestration remains a repeated topic in AI tooling feeds.',
          matchedTopicIds: ['ai-developer-tools'],
          matchedRules: [
            'topic:ai-developer-tools',
            'provider:github-repo-radar',
          ],
          signalScore: 0.82,
          providerMetrics: [
            BriefingProviderMetricApiDto(label: 'Stars', value: '18,500'),
            BriefingProviderMetricApiDto(label: 'Trend', value: '+120 / 48h'),
          ],
          whyImportant: [
            'Agent graph orchestration remains a repeated topic in AI tooling feeds.',
          ],
          whyNow: 'Current summary window has Repo Radar coverage.',
          canonicalUrl: 'https://github.com/langchain-ai/langgraph',
          citationIds: ['bc-3'],
        ),
      ],
    ),
    topStories: const [
      BriefingStoryApiDto(
        title: 'openai/codex leads today\'s repo radar',
        summary:
            'AI coding-agent tooling is the strongest repository signal in the monitored scope.',
        topicCount: 3,
        providerCount: 3,
        citationIds: ['bc-1', 'bc-2', 'bc-3'],
      ),
    ],
    citations: [
      summaryCitationApiDto(
        id: 'bc-1',
        sourceLabel: 'Repo Radar [1] openai/codex',
        rawSnippet: '54.0k stars, +210 in 24h and +360 in 48h.',
        canonicalUrl: 'https://github.com/openai/codex',
      ),
      summaryCitationApiDto(
        id: 'bc-2',
        sourceLabel: 'Repo Radar [2] firecrawl/firecrawl',
        rawSnippet:
            'Web data infrastructure project continues gaining developer attention.',
        canonicalUrl: 'https://github.com/firecrawl/firecrawl',
      ),
      summaryCitationApiDto(
        id: 'bc-3',
        sourceLabel: 'Repo Radar [3] langchain-ai/langgraph',
        rawSnippet:
            'Agent graph orchestration remains a repeated topic in AI tooling feeds.',
        canonicalUrl: 'https://github.com/langchain-ai/langgraph',
      ),
    ],
  );
}

PageResult<GeneratedSummary> generatedSummaryPage(
  List<GeneratedSummary> items, {
  PageRequest request = const PageRequest(),
}) {
  return PageResult<GeneratedSummary>(items: items, request: request);
}
