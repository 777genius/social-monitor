import '../../infrastructure/api/summary_api_dto.dart';

List<SummaryApiDto> summariesFeatureDemoItems() {
  return const [
    SummaryApiDto(
      id: 's-1',
      title: 'GitHub Trending daily summary',
      status: 'ready',
      bodyText:
          'GitHub Trending surfaced calesthio/OpenMontage, apple/container and ZhuLinsen/daily_stock_analysis from github.com/trending today. Repo Radar remains the historical growth view for 7d, 30d and 90d follow-up.',
      citations: [
        SummaryCitationApiDto(
          id: 'c-1',
          sourceLabel:
              'GitHub Trending - github.com/trending page [1] calesthio/OpenMontage',
          rawSnippet: '18.4k stars, #1 today and +3.7k stars today.',
          canonicalUrl: 'https://github.com/calesthio/OpenMontage',
        ),
        SummaryCitationApiDto(
          id: 'c-2',
          sourceLabel:
              'GitHub Trending - github.com/trending page [2] apple/container',
          rawSnippet:
              'Apple container tooling is #2 today with +1.7k stars today.',
          canonicalUrl: 'https://github.com/apple/container',
        ),
        SummaryCitationApiDto(
          id: 'c-3',
          sourceLabel:
              'GitHub Trending - github.com/trending page [3] ZhuLinsen/daily_stock_analysis',
          rawSnippet:
              'LLM-powered stock analysis is a high-rank daily GitHub Trending project.',
          canonicalUrl: 'https://github.com/ZhuLinsen/daily_stock_analysis',
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
        'GitHub Trending page found concrete repositories worth reviewing today, while Repo Radar should be used for longer-window GH Archive growth checks.',
    userId: 'user-demo',
    readerBrief: BriefingReaderBriefApiDto(
      headline: 'GitHub daily radar',
      oneLineTakeaway:
          'GitHub Trending is the daily radar for what is breaking out today; Repo Radar is the historical analytics layer for 7d, 30d and 90d growth.',
      bullets: [
        'Best first read: calesthio/OpenMontage because it is #1 on github.com/trending today.',
        'Use Repo Radar after reading to check whether the same repositories sustain growth beyond the daily page.',
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
              title: 'calesthio/OpenMontage',
              providerKey: 'github-trending-page',
              reason: '#1 on github.com/trending today, +3.7k stars today.',
              canonicalUrl: 'https://github.com/calesthio/OpenMontage',
              citationIds: ['bc-1'],
            ),
            BriefingReaderItemApiDto(
              title: 'apple/container',
              providerKey: 'github-trending-page',
              reason:
                  '#2 on github.com/trending today, useful infrastructure signal.',
              canonicalUrl: 'https://github.com/apple/container',
              citationIds: ['bc-2'],
            ),
            BriefingReaderItemApiDto(
              title: 'ZhuLinsen/daily_stock_analysis',
              providerKey: 'github-trending-page',
              reason:
                  'High-rank daily GitHub Trending project in LLM-assisted analysis.',
              canonicalUrl: 'https://github.com/ZhuLinsen/daily_stock_analysis',
              citationIds: ['bc-3'],
            ),
          ],
        ),
      ],
      sourceMix: [
        BriefingSourceMixEntryApiDto(
          providerKey: 'github-trending-page',
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
          title: 'calesthio/OpenMontage',
          providerKey: 'github-trending-page',
          reason:
              '#1 repository on github.com/trending today with +3.7k stars today.',
          matchedTopicIds: ['ai-developer-tools'],
          matchedRules: [
            'topic:ai-developer-tools',
            'provider:github-trending-page',
          ],
          signalScore: 1,
          providerMetrics: [
            BriefingProviderMetricApiDto(
              label: 'GitHub Trending today',
              value: '#1, +3,703 stars today',
            ),
            BriefingProviderMetricApiDto(label: 'Stars', value: '18,398'),
          ],
          whyImportant: [
            'It is the clearest daily breakout on the public GitHub Trending page.',
          ],
          whyNow:
              'Current summary window has github.com/trending page coverage.',
          canonicalUrl: 'https://github.com/calesthio/OpenMontage',
          citationIds: ['bc-1'],
        ),
        BriefingReaderItemApiDto(
          title: 'apple/container',
          providerKey: 'github-trending-page',
          reason:
              'Useful infrastructure follow-up from today\'s Trending page.',
          matchedTopicIds: ['ai-developer-tools'],
          matchedRules: [
            'topic:ai-developer-tools',
            'provider:github-trending-page',
          ],
          signalScore: 0.9,
          providerMetrics: [
            BriefingProviderMetricApiDto(
              label: 'GitHub Trending today',
              value: '#2, +1,746 stars today',
            ),
            BriefingProviderMetricApiDto(label: 'Stars', value: '41,719'),
          ],
          whyImportant: ['Useful infrastructure signal from Apple.'],
          whyNow:
              'Current summary window has github.com/trending page coverage.',
          canonicalUrl: 'https://github.com/apple/container',
          citationIds: ['bc-2'],
        ),
        BriefingReaderItemApiDto(
          title: 'ZhuLinsen/daily_stock_analysis',
          providerKey: 'github-trending-page',
          reason: 'Useful follow-up for LLM-assisted analysis workflows.',
          matchedTopicIds: ['ai-developer-tools'],
          matchedRules: [
            'topic:ai-developer-tools',
            'provider:github-trending-page',
          ],
          signalScore: 0.82,
          providerMetrics: [
            BriefingProviderMetricApiDto(
              label: 'GitHub Trending today',
              value: '#3 daily signal',
            ),
            BriefingProviderMetricApiDto(
              label: 'Source',
              value: 'github.com/trending',
            ),
          ],
          whyImportant: [
            'Shows LLM workflows breaking into daily GitHub attention.',
          ],
          whyNow:
              'Current summary window has github.com/trending page coverage.',
          canonicalUrl: 'https://github.com/ZhuLinsen/daily_stock_analysis',
          citationIds: ['bc-3'],
        ),
      ],
      trendDelta: BriefingTrendDeltaApiDto(
        newSignals: ['3 GitHub Trending page items selected'],
        growingSignals: ['AI developer tools'],
        repeatedSignals: ['Agents plus evals'],
        fadingSignals: [],
      ),
      openQuestions: [
        'Do the same repositories sustain growth in Repo Radar 7d, 30d and 90d windows?',
        'Do Reddit, Hacker News or RSS sources confirm the same GitHub Trending signals?',
      ],
      risks: ['GitHub stars measure attention, not production adoption.'],
      nextActions: [
        BriefingNextActionApiDto(
          kind: 'watch_repository',
          label: 'Watch calesthio/OpenMontage',
          reason:
              'Track whether daily Trending attention continues in Repo Radar history.',
          citationIds: ['bc-1'],
          canonicalUrl: 'https://github.com/calesthio/OpenMontage',
        ),
      ],
    ),
    topStories: [
      BriefingStoryApiDto(
        title: 'OpenMontage leads today\'s GitHub Trending page',
        summary:
            'The daily radar is driven by the public github.com/trending page, not Repo Radar history.',
        topicCount: 3,
        providerCount: 3,
        citationIds: ['bc-1', 'bc-2', 'bc-3'],
      ),
      BriefingStoryApiDto(
        title: 'Apple container and daily stock analysis are useful follow-ups',
        summary:
            'Infrastructure and LLM-assisted analysis projects are appearing alongside the top daily repository.',
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
        sourceLabel:
            'GitHub Trending - github.com/trending page [1] calesthio/OpenMontage',
        rawSnippet: '18.4k stars, #1 today and +3.7k stars today.',
        canonicalUrl: 'https://github.com/calesthio/OpenMontage',
      ),
      SummaryCitationApiDto(
        id: 'bc-2',
        sourceLabel:
            'GitHub Trending - github.com/trending page [2] apple/container',
        rawSnippet:
            'Apple container tooling is #2 today with +1.7k stars today.',
        canonicalUrl: 'https://github.com/apple/container',
      ),
      SummaryCitationApiDto(
        id: 'bc-3',
        sourceLabel:
            'GitHub Trending - github.com/trending page [3] ZhuLinsen/daily_stock_analysis',
        rawSnippet:
            'LLM-powered stock analysis is a high-rank daily GitHub Trending project.',
        canonicalUrl: 'https://github.com/ZhuLinsen/daily_stock_analysis',
      ),
    ],
    freshnessLabel: 'Fresh',
    isDegraded: false,
  );
}
