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
  String sourceProviderKey = 'github-repo-radar',
  List<String> newSignals = const ['1 Repo Radar item selected'],
  BriefingReaderQualityStateApiDto? qualityState,
  List<BriefingSourceMixEntryApiDto>? sourceMix,
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
  final primaryRead = topReads.isNotEmpty ? topReads.first : null;
  final primaryTitle = primaryRead?.title ?? 'source';
  final primaryUrl = primaryRead?.canonicalUrl;
  final primaryCitationIds = primaryRead?.citationIds ?? const <String>[];

  return BriefingReaderBriefApiDto(
    headline: headline,
    oneLineTakeaway: oneLineTakeaway,
    bullets: const [
      'Best first read: AI coding tools because it is the strongest selected signal.',
    ],
    qualityState:
        qualityState ??
        const BriefingReaderQualityStateApiDto(
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
    sourceMix:
        sourceMix ??
        [
          BriefingSourceMixEntryApiDto(
            providerKey: sourceProviderKey,
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
    trendDelta: BriefingTrendDeltaApiDto(
      newSignals: newSignals,
      growingSignals: const ['Developer tooling'],
      repeatedSignals: [],
      fadingSignals: [],
    ),
    openQuestions: const [],
    risks: const [],
    nextActions: [
      BriefingNextActionApiDto(
        kind: 'read_source',
        label: 'Read source',
        reason: 'Open the cited source behind this summary item.',
        canonicalUrl: primaryUrl,
        citationIds: primaryCitationIds,
      ),
      BriefingNextActionApiDto(
        kind: 'watch_repository',
        label: 'Watch $primaryTitle',
        reason: 'Check whether the signal keeps growing.',
        canonicalUrl: primaryUrl,
        citationIds: primaryCitationIds,
      ),
      BriefingNextActionApiDto(
        kind: 'mark_relevant',
        label: 'Mark relevant',
        reason: 'Use feedback to keep future summaries aligned.',
        canonicalUrl: primaryUrl,
        citationIds: primaryCitationIds,
      ),
      BriefingNextActionApiDto(
        kind: 'mark_not_relevant',
        label: 'Not relevant',
        reason: 'Use feedback to reduce similar future signals.',
        canonicalUrl: primaryUrl,
        citationIds: primaryCitationIds,
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

SummaryApiDto githubTrendingSummaryApiDto() {
  return summaryApiDto(
    title: 'GitHub Trending daily summary',
    bodyText:
        'GitHub Trending surfaced calesthio/OpenMontage, apple/container and ZhuLinsen/daily_stock_analysis from github.com/trending today. Repo Radar remains the historical growth view for 7d, 30d and 90d follow-up.',
    citations: [
      summaryCitationApiDto(
        id: 'c-1',
        sourceLabel:
            'GitHub Trending - github.com/trending page [1] calesthio/OpenMontage',
        rawSnippet: '18.4k stars, #1 today and +3.7k stars today.',
        canonicalUrl: 'https://github.com/calesthio/OpenMontage',
      ),
      summaryCitationApiDto(
        id: 'c-2',
        sourceLabel:
            'GitHub Trending - github.com/trending page [2] apple/container',
        rawSnippet:
            'Apple container tooling is #2 today with +1.7k stars today.',
        canonicalUrl: 'https://github.com/apple/container',
      ),
      summaryCitationApiDto(
        id: 'c-3',
        sourceLabel:
            'GitHub Trending - github.com/trending page [3] ZhuLinsen/daily_stock_analysis',
        rawSnippet:
            'LLM-powered stock analysis is a high-rank daily GitHub Trending project.',
        canonicalUrl: 'https://github.com/ZhuLinsen/daily_stock_analysis',
      ),
    ],
  );
}

BriefingApiDto githubTrendingBriefingApiDto() {
  return briefingApiDto(
    title: 'AI signal summary',
    executiveSummary:
        'GitHub Trending page found concrete repositories worth reviewing today, while Repo Radar should be used for longer-window GH Archive growth checks.',
    readerBrief: briefingReaderBriefApiDto(
      headline: 'GitHub daily radar',
      oneLineTakeaway:
          'GitHub Trending is the daily radar for what is breaking out today; Repo Radar is the historical analytics layer for 7d, 30d and 90d growth.',
      sourceProviderKey: 'github-trending-page',
      newSignals: const ['3 GitHub Trending page items selected'],
      topReads: const [
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
          confidence: BriefingReaderItemConfidenceApiDto(
            level: 'medium',
            score: 0.57,
            rationale: 'Daily GitHub Trending signal with raw metrics.',
          ),
          confirmedProviderKeys: ['github-trending-page'],
          providerMetrics: [
            BriefingProviderMetricApiDto(label: 'Story signal', value: '1'),
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
    ),
    topStories: const [
      BriefingStoryApiDto(
        title: 'OpenMontage leads today\'s GitHub Trending page',
        summary:
            'The daily radar is driven by the public github.com/trending page, not Repo Radar history.',
        topicCount: 3,
        providerCount: 1,
        citationIds: ['bc-1', 'bc-2', 'bc-3'],
      ),
    ],
    citations: [
      summaryCitationApiDto(
        id: 'bc-1',
        sourceLabel:
            'GitHub Trending - github.com/trending page [1] calesthio/OpenMontage',
        rawSnippet: '18.4k stars, #1 today and +3.7k stars today.',
        canonicalUrl: 'https://github.com/calesthio/OpenMontage',
      ),
      summaryCitationApiDto(
        id: 'bc-2',
        sourceLabel:
            'GitHub Trending - github.com/trending page [2] apple/container',
        rawSnippet:
            'Apple container tooling is #2 today with +1.7k stars today.',
        canonicalUrl: 'https://github.com/apple/container',
      ),
      summaryCitationApiDto(
        id: 'bc-3',
        sourceLabel:
            'GitHub Trending - github.com/trending page [3] ZhuLinsen/daily_stock_analysis',
        rawSnippet:
            'LLM-powered stock analysis is a high-rank daily GitHub Trending project.',
        canonicalUrl: 'https://github.com/ZhuLinsen/daily_stock_analysis',
      ),
    ],
  );
}

BriefingApiDto repoRadarTopTenBriefingApiDto() {
  final topReads = List<BriefingReaderItemApiDto>.generate(11, (index) {
    final rank = index + 1;

    return BriefingReaderItemApiDto(
      title: 'repo-radar/project-$rank',
      providerKey: 'github-repo-radar',
      reason: 'Repository $rank is gaining stars in the current window.',
      matchedTopicIds: const ['ai-developer-tools'],
      matchedRules: const [
        'topic:ai-developer-tools',
        'provider:github-repo-radar',
      ],
      signalScore: 1 - index / 20,
      providerMetrics: [
        BriefingProviderMetricApiDto(
          label: 'Stars',
          value: '${54000 - index * 100}',
        ),
        BriefingProviderMetricApiDto(
          label: 'Trend',
          value: '+${360 - index} / 48h',
        ),
      ],
      whyImportant: [
        'Repository $rank is gaining stars in the current window.',
      ],
      whyNow: 'Current summary window has Repo Radar coverage.',
      canonicalUrl: 'https://github.com/repo-radar/project-$rank',
      citationIds: ['bc-$rank'],
    );
  });

  return briefingApiDto(
    title: 'Repo radar top ten briefing',
    executiveSummary:
        'GitHub Repo Radar found ten repositories worth reviewing today.',
    readerBrief: briefingReaderBriefApiDto(
      headline: 'Repo radar top ten',
      oneLineTakeaway:
          'Review the ten strongest repository signals before drilling into the long tail.',
      topReads: topReads,
    ),
    citations: List<SummaryCitationApiDto>.generate(11, (index) {
      final rank = index + 1;

      return summaryCitationApiDto(
        id: 'bc-$rank',
        sourceLabel: 'Repo Radar [$rank] repo-radar/project-$rank',
        rawSnippet: 'Repository $rank is gaining stars in the current window.',
        canonicalUrl: 'https://github.com/repo-radar/project-$rank',
      );
    }),
  );
}

PageResult<GeneratedSummary> generatedSummaryPage(
  List<GeneratedSummary> items, {
  PageRequest request = const PageRequest(),
}) {
  return PageResult<GeneratedSummary>(items: items, request: request);
}
