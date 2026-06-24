import '../../infrastructure/api/summary_api_dto.dart';

List<SummaryApiDto> summariesFeatureDemoItems() {
  return const [
    SummaryApiDto(
      id: 's-1',
      title: 'GitHub repo radar summary',
      status: 'ready',
      bodyText:
          'Repo Radar found openai/codex, firecrawl/firecrawl and langchain-ai/langgraph as the strongest AI developer-tool signals today.',
      citations: [
        SummaryCitationApiDto(
          id: 'c-1',
          sourceLabel: 'Repo Radar [1] openai/codex',
          rawSnippet: '54.0k stars, +210 in 24h and +360 in 48h.',
          canonicalUrl: 'https://github.com/openai/codex',
        ),
        SummaryCitationApiDto(
          id: 'c-2',
          sourceLabel: 'Repo Radar [2] firecrawl/firecrawl',
          rawSnippet:
              'Web data infrastructure project continues gaining developer attention.',
          canonicalUrl: 'https://github.com/firecrawl/firecrawl',
        ),
        SummaryCitationApiDto(
          id: 'c-3',
          sourceLabel: 'Repo Radar [3] langchain-ai/langgraph',
          rawSnippet:
              'Agent graph orchestration remains a repeated topic in AI tooling feeds.',
          canonicalUrl: 'https://github.com/langchain-ai/langgraph',
        ),
      ],
      freshnessLabel: 'Today',
      feedbackSubmitted: false,
    ),
    SummaryApiDto(
      id: 's-2',
      title: 'Launch sentiment pulse',
      status: 'generating',
      bodyText: 'A new pulse is being generated from reviewed mentions.',
      citations: [
        SummaryCitationApiDto(
          id: 'c-3',
          sourceLabel: 'Hacker News',
          rawSnippet: 'Commenters asked for native integrations.',
        ),
      ],
      freshnessLabel: 'Queued',
      feedbackSubmitted: false,
    ),
  ];
}

BriefingApiDto summariesFeatureDemoBriefing() {
  return const BriefingApiDto(
    id: 'briefing-demo-1',
    title: 'AI signal summary',
    executiveSummary:
        'GitHub Repo Radar found concrete AI developer-tool repositories worth reviewing today.',
    userId: 'user-demo',
    readerBrief: BriefingReaderBriefApiDto(
      headline: 'AI repo radar',
      oneLineTakeaway:
          'GitHub Repo Radar found one strong AI developer-tool signal and two useful follow-up repositories, but this summary is not cross-source confirmed yet.',
      bullets: [
        'Best first read: openai/codex because it combines strong star growth with direct agent-tooling relevance.',
        '2 follow-up links cover adjacent web data and agent orchestration workflows.',
      ],
      qualityState: BriefingReaderQualityStateApiDto(
        status: 'limited_sources',
        flags: ['limited_sources'],
        warnings: ['Source coverage is limited or single-source.'],
        isSingleSource: true,
      ),
      topicSections: [
        BriefingTopicSectionApiDto(
          title: 'AI developer tools',
          insight:
              'The strongest items are practical infrastructure and agent workflow repositories, not generic AI news.',
          citationIds: ['bc-1', 'bc-2', 'bc-3'],
          items: [
            BriefingReaderItemApiDto(
              title: 'openai/codex',
              providerKey: 'github-repo-radar',
              reason: '54.0k stars, +210 in 24h and +360 in 48h.',
              canonicalUrl: 'https://github.com/openai/codex',
              citationIds: ['bc-1'],
            ),
            BriefingReaderItemApiDto(
              title: 'firecrawl/firecrawl',
              providerKey: 'github-repo-radar',
              reason:
                  'Web data infrastructure project continues gaining developer attention.',
              canonicalUrl: 'https://github.com/firecrawl/firecrawl',
              citationIds: ['bc-2'],
            ),
            BriefingReaderItemApiDto(
              title: 'langchain-ai/langgraph',
              providerKey: 'github-repo-radar',
              reason:
                  'Agent graph orchestration remains a repeated topic in AI tooling feeds.',
              canonicalUrl: 'https://github.com/langchain-ai/langgraph',
              citationIds: ['bc-3'],
            ),
          ],
        ),
      ],
      sourceMix: [
        BriefingSourceMixEntryApiDto(
          providerKey: 'github-repo-radar',
          itemCount: 3,
          citationCount: 3,
          storyClusterCount: 3,
          crossSourceClusterCount: 0,
          singleSourceOnly: true,
          topicIds: ['ai-developer-tools'],
        ),
      ],
      topReads: [
        BriefingReaderItemApiDto(
          title: 'openai/codex',
          providerKey: 'github-repo-radar',
          reason:
              'Fastest-growing repo in today\'s monitored AI tooling slice.',
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
          whyImportant: [
            'Fastest-growing repo in today\'s monitored AI tooling slice.',
          ],
          whyNow: 'Current summary window has Repo Radar coverage.',
          canonicalUrl: 'https://github.com/openai/codex',
          citationIds: ['bc-1'],
        ),
        BriefingReaderItemApiDto(
          title: 'firecrawl/firecrawl',
          providerKey: 'github-repo-radar',
          reason: 'Useful follow-up for web data and AI retrieval workflows.',
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
            'Useful follow-up for web data and AI retrieval workflows.',
          ],
          whyNow: 'Current summary window has Repo Radar coverage.',
          canonicalUrl: 'https://github.com/firecrawl/firecrawl',
          citationIds: ['bc-2'],
        ),
        BriefingReaderItemApiDto(
          title: 'langchain-ai/langgraph',
          providerKey: 'github-repo-radar',
          reason: 'Useful follow-up for agent orchestration patterns.',
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
          whyImportant: ['Useful follow-up for agent orchestration patterns.'],
          whyNow: 'Current summary window has Repo Radar coverage.',
          canonicalUrl: 'https://github.com/langchain-ai/langgraph',
          citationIds: ['bc-3'],
        ),
      ],
      trendDelta: BriefingTrendDeltaApiDto(
        newSignals: ['3 Repo Radar items selected'],
        growingSignals: ['AI developer tools'],
        repeatedSignals: ['Agents plus evals'],
        fadingSignals: [],
      ),
      openQuestions: [
        'Is codex growth sustained beyond the first launch wave?',
        'Do Reddit, Hacker News or RSS sources confirm the same signal?',
      ],
      risks: ['GitHub stars measure attention, not production adoption.'],
      nextActions: [
        BriefingNextActionApiDto(
          kind: 'watch_repository',
          label: 'Watch openai/codex',
          reason: 'Track whether growth continues over the next 24h.',
          citationIds: ['bc-1'],
          canonicalUrl: 'https://github.com/openai/codex',
        ),
      ],
    ),
    topStories: [
      BriefingStoryApiDto(
        title: 'openai/codex leads today\'s repo radar',
        summary:
            'AI coding-agent tooling is the strongest repository signal in the monitored scope.',
        topicCount: 3,
        providerCount: 3,
        citationIds: ['bc-1', 'bc-2', 'bc-3'],
      ),
      BriefingStoryApiDto(
        title: 'Firecrawl and LangGraph remain useful follow-ups',
        summary:
            'Web extraction and graph-based agent workflows are still appearing in adjacent tooling signals.',
        topicCount: 2,
        providerCount: 2,
        citationIds: ['bc-2', 'bc-3'],
      ),
    ],
    repeatedSignals: [
      BriefingRepeatedSignalApiDto(
        title: 'Agents plus evals repeated across monitored topics',
        topicIds: ['ai-news', 'github-trends', 'developer-tools'],
        citationIds: ['bc-1'],
      ),
    ],
    citations: [
      SummaryCitationApiDto(
        id: 'bc-1',
        sourceLabel: 'Repo Radar [1] openai/codex',
        rawSnippet: '54.0k stars, +210 in 24h and +360 in 48h.',
        canonicalUrl: 'https://github.com/openai/codex',
      ),
      SummaryCitationApiDto(
        id: 'bc-2',
        sourceLabel: 'Repo Radar [2] firecrawl/firecrawl',
        rawSnippet:
            'Web data infrastructure project continues gaining developer attention.',
        canonicalUrl: 'https://github.com/firecrawl/firecrawl',
      ),
      SummaryCitationApiDto(
        id: 'bc-3',
        sourceLabel: 'Repo Radar [3] langchain-ai/langgraph',
        rawSnippet:
            'Agent graph orchestration remains a repeated topic in AI tooling feeds.',
        canonicalUrl: 'https://github.com/langchain-ai/langgraph',
      ),
    ],
    freshnessLabel: 'Fresh',
    isDegraded: false,
  );
}
