import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

import 'summaries_test_fixtures.dart';

BriefingApiDto mixedSourceBriefingApiDto() {
  return briefingApiDto(
    title: 'Mixed AI source summary',
    executiveSummary:
        'Reddit, GitHub and Hacker News all contributed cited AI signals.',
    readerBrief: briefingReaderBriefApiDto(
      headline: 'AI source mix',
      oneLineTakeaway:
          'The current AI signal is confirmed across discussion and repository sources.',
      qualityState: const BriefingReaderQualityStateApiDto(
        status: 'ready',
        flags: [],
        warnings: [],
        isSingleSource: false,
      ),
      sourceMix: const [
        BriefingSourceMixEntryApiDto(
          providerKey: 'reddit',
          itemCount: 2,
          citationCount: 2,
          storyClusterCount: 2,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          topicIds: ['ai-developer-tools'],
        ),
        BriefingSourceMixEntryApiDto(
          providerKey: 'github-trending-page',
          itemCount: 2,
          citationCount: 2,
          storyClusterCount: 2,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          topicIds: ['ai-developer-tools'],
        ),
        BriefingSourceMixEntryApiDto(
          providerKey: 'hacker-news',
          itemCount: 2,
          citationCount: 2,
          storyClusterCount: 2,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          topicIds: ['ai-developer-tools'],
        ),
      ],
      topReads: const [
        BriefingReaderItemApiDto(
          title: 'Reddit thread on agent reliability',
          providerKey: 'reddit',
          reason: 'High-engagement Reddit discussion with concrete failures.',
          matchedTopicIds: ['ai-developer-tools'],
          matchedRules: ['provider:reddit', 'topic:ai-developer-tools'],
          signalScore: 0.94,
          providerMetrics: [
            BriefingProviderMetricApiDto(label: 'Reddit score', value: '540'),
            BriefingProviderMetricApiDto(label: 'Comments', value: '126'),
          ],
          whyImportant: ['Shows what practitioners are struggling with.'],
          whyNow: 'Current summary window includes an active Reddit thread.',
          canonicalUrl: 'https://reddit.example/r/MachineLearning/comments/1',
          citationIds: ['bc-1'],
        ),
        BriefingReaderItemApiDto(
          title: 'calesthio/OpenMontage',
          providerKey: 'github-trending-page',
          reason: 'Daily GitHub Trending repository in the AI workflow space.',
          matchedTopicIds: ['ai-developer-tools'],
          matchedRules: [
            'provider:github-trending-page',
            'topic:ai-developer-tools',
          ],
          signalScore: 0.89,
          providerMetrics: [
            BriefingProviderMetricApiDto(label: 'Stars', value: '18,398'),
            BriefingProviderMetricApiDto(
              label: 'GitHub Trending today',
              value: '#1, +3,703 stars today',
            ),
          ],
          whyImportant: ['Shows repository attention around AI workflows.'],
          whyNow: 'Current summary window includes GitHub Trending coverage.',
          canonicalUrl: 'https://github.com/calesthio/OpenMontage',
          citationIds: ['bc-2'],
        ),
        BriefingReaderItemApiDto(
          title: 'HN discussion on model routing',
          providerKey: 'hacker-news',
          reason: 'Hacker News discussion adds technical review context.',
          matchedTopicIds: ['ai-developer-tools'],
          matchedRules: ['provider:hacker-news', 'topic:ai-developer-tools'],
          signalScore: 0.83,
          providerMetrics: [
            BriefingProviderMetricApiDto(label: 'HN points', value: '312'),
            BriefingProviderMetricApiDto(label: 'Comments', value: '74'),
          ],
          whyImportant: [
            'Adds engineering critique beyond repository metrics.',
          ],
          whyNow: 'Current summary window includes Hacker News discussion.',
          canonicalUrl: 'https://news.ycombinator.com/item?id=1',
          citationIds: ['bc-3'],
        ),
      ],
    ),
    citations: [
      summaryCitationApiDto(
        id: 'bc-1',
        sourceLabel: 'Reddit - r/MachineLearning',
        rawSnippet: 'Practitioners compare agent reliability incidents.',
        canonicalUrl: 'https://reddit.example/r/MachineLearning/comments/1',
      ),
      summaryCitationApiDto(
        id: 'bc-2',
        sourceLabel: 'GitHub Trending - calesthio/OpenMontage',
        rawSnippet: 'Repository gained rapid daily attention.',
        canonicalUrl: 'https://github.com/calesthio/OpenMontage',
      ),
      summaryCitationApiDto(
        id: 'bc-3',
        sourceLabel: 'Hacker News',
        rawSnippet: 'Engineers discuss model routing tradeoffs.',
        canonicalUrl: 'https://news.ycombinator.com/item?id=1',
      ),
    ],
  );
}
