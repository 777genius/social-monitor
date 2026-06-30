import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/interest_coverage_plan_api_dto.dart';
import 'interest_coverage_plans_api_client.dart';

final class InMemoryInterestCoveragePlansApiClient
    implements InterestCoveragePlansApiClient {
  const InMemoryInterestCoveragePlansApiClient({
    required this.plan,
    this.sourcePacks = _sourcePacks,
  });

  final InterestCoveragePlanApiDto plan;
  final Map<String, InterestCoverageSourcePackApiDto> sourcePacks;

  @override
  Future<Result<InterestCoveragePlanApiDto>> planInterestCoverage(
    PlanInterestCoverageApiRequestDto request,
  ) async {
    final sourcePack = switch (request.sourcePackKey) {
      final key? => sourcePacks[key] ?? plan.sourcePack,
      _ => plan.sourcePack,
    };
    return Result.success(
      InterestCoveragePlanApiDto(
        interestId: request.interestId,
        interestTitle: plan.interestTitle,
        planningQuery: plan.planningQuery,
        normalizedKeywords: plan.normalizedKeywords,
        sourcePack: sourcePack,
        drafts: plan.drafts,
        coverageGaps: plan.coverageGaps,
        skippedProviders: plan.skippedProviders,
      ),
    );
  }
}

const _sourcePacks = {
  'ai_dev': InterestCoverageSourcePackApiDto(
    key: 'ai_dev',
    displayName: 'AI development radar',
    description: 'Developer communities, model releases and OSS agent stacks.',
    providerStarters: [
      InterestCoverageSourcePackProviderStarterApiDto(
        providerKey: 'reddit',
        label: 'AI builders',
        keywords: ['AI agents', 'LLM apps'],
        queries: ['AI agents', 'LLM apps'],
        subreddits: ['LocalLLaMA', 'MachineLearning', 'singularity'],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      ),
      InterestCoverageSourcePackProviderStarterApiDto(
        providerKey: 'hacker-news',
        label: 'HN launch discussion',
        keywords: ['AI agents', 'LLM apps'],
        queries: ['AI agents', 'LLM apps', 'model release'],
        subreddits: [],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      ),
      InterestCoverageSourcePackProviderStarterApiDto(
        providerKey: 'github-repo-radar',
        label: 'OSS movement',
        keywords: ['agents', 'llm-apps'],
        queries: [],
        subreddits: [],
        topics: ['agents', 'llm-apps', 'rag'],
        languages: ['TypeScript', 'Python'],
        rssFeedUrls: [],
      ),
      InterestCoverageSourcePackProviderStarterApiDto(
        providerKey: 'rss',
        label: 'AI release feeds',
        keywords: ['AI agents', 'LLM apps'],
        queries: [],
        subreddits: [],
        topics: [],
        languages: [],
        rssFeedUrls: ['https://github.blog/feed'],
      ),
    ],
  ),
  'startup_radar': InterestCoverageSourcePackApiDto(
    key: 'startup_radar',
    displayName: 'Startup radar',
    description: 'Launches, funding signals and founder community movement.',
    providerStarters: [
      InterestCoverageSourcePackProviderStarterApiDto(
        providerKey: 'reddit',
        label: 'Founder communities',
        keywords: ['startup launch', 'funding'],
        queries: ['startup launch', 'funding'],
        subreddits: ['startups', 'Entrepreneur', 'SaaS'],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      ),
      InterestCoverageSourcePackProviderStarterApiDto(
        providerKey: 'rss',
        label: 'Startup feeds',
        keywords: ['startup launch', 'funding'],
        queries: [],
        subreddits: [],
        topics: [],
        languages: [],
        rssFeedUrls: ['https://techcrunch.com/category/startups/feed/'],
      ),
    ],
  ),
  'security': InterestCoverageSourcePackApiDto(
    key: 'security',
    displayName: 'Security radar',
    description: 'Threat research, advisories and practitioner discussions.',
    providerStarters: [
      InterestCoverageSourcePackProviderStarterApiDto(
        providerKey: 'reddit',
        label: 'Security communities',
        keywords: ['vulnerability', 'incident'],
        queries: ['vulnerability', 'incident response'],
        subreddits: ['netsec', 'cybersecurity', 'blueteamsec'],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      ),
      InterestCoverageSourcePackProviderStarterApiDto(
        providerKey: 'rss',
        label: 'Advisory feeds',
        keywords: ['vulnerability', 'incident'],
        queries: [],
        subreddits: [],
        topics: [],
        languages: [],
        rssFeedUrls: ['https://www.cisa.gov/cybersecurity-advisories/all.xml'],
      ),
    ],
  ),
  'crypto': InterestCoverageSourcePackApiDto(
    key: 'crypto',
    displayName: 'Crypto radar',
    description: 'Protocol updates, market narratives and developer signals.',
    providerStarters: [
      InterestCoverageSourcePackProviderStarterApiDto(
        providerKey: 'reddit',
        label: 'Crypto communities',
        keywords: ['protocol upgrade', 'airdrop'],
        queries: ['protocol upgrade', 'airdrop'],
        subreddits: ['CryptoCurrency', 'ethfinance', 'defi'],
        topics: [],
        languages: [],
        rssFeedUrls: [],
      ),
      InterestCoverageSourcePackProviderStarterApiDto(
        providerKey: 'github-repo-radar',
        label: 'Protocol repos',
        keywords: ['defi', 'ethereum'],
        queries: [],
        subreddits: [],
        topics: ['defi', 'ethereum', 'solana'],
        languages: ['Rust', 'Solidity', 'Go'],
        rssFeedUrls: [],
      ),
    ],
  ),
};
