import '../../infrastructure/api/summary_api_dto.dart';

List<SummaryApiDto> summariesFeatureDemoItems() {
  return const [
    SummaryApiDto(
      id: 's-1',
      title: 'Weekly risk briefing',
      status: 'ready',
      bodyText:
          'Pricing pressure increased this week while launch sentiment stayed stable.',
      citations: [
        SummaryCitationApiDto(
          id: 'c-1',
          sourceLabel: 'Reddit thread',
          rawSnippet: 'Users compared competitor pricing tiers.',
        ),
        SummaryCitationApiDto(
          id: 'c-2',
          sourceLabel: 'RSS item',
          rawSnippet: 'Launch coverage remained positive.',
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
    title: 'AI signal briefing',
    executiveSummary:
        'AI developer tools and open-source libraries are the strongest repeated signals across monitored sources.',
    topStories: [
      BriefingStoryApiDto(
        title: 'Open-source AI agents are trending',
        summary:
            'The same tooling story appears across Reddit, GitHub and Hacker News discussions.',
        topicCount: 3,
        providerCount: 3,
        citationIds: ['bc-1'],
      ),
      BriefingStoryApiDto(
        title: 'Evaluation workflows are becoming a purchase driver',
        summary:
            'Teams are comparing eval tooling before adopting new AI coding products.',
        topicCount: 2,
        providerCount: 2,
        citationIds: ['bc-2'],
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
        sourceLabel: 'Reddit [1]',
        rawSnippet: 'Evidence field title from source item demo-reddit-1',
      ),
      SummaryCitationApiDto(
        id: 'bc-2',
        sourceLabel: 'GitHub [2]',
        rawSnippet: 'Evidence field title from source item demo-github-1',
      ),
    ],
    freshnessLabel: 'Fresh',
    isDegraded: false,
  );
}
