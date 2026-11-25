import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_sources/src/infrastructure/api/interest_coverage_plan_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/mappers/generated_interest_coverage_plan_rest_mapper.dart';

void main() {
  test('maps generated coverage plan drafts and nested configs', () {
    const mapper = GeneratedInterestCoveragePlanRestMapper();

    final response = generated.PlanInterestCoverageResponseDto(
      interest: generated.InterestResponseDto(
        id: 'interest-competitor',
        tenantId: 'tenant-demo',
        workspaceId: 'workspace-demo',
        name: 'Competitor launches',
        query: 'competitor launch',
        status: generated.InterestResponseDtoStatusStatus.active,
        createdAt: DateTime.utc(2026, 6, 23, 12),
      ),
      planningQuery: '"Competitor launches" OR pricing',
      normalizedKeywords: const ['Competitor launches', 'pricing'],
      sourcePack: const generated.InterestCoverageSourcePackDto(
        key: 'ai_dev',
        displayName: 'AI dev',
        description: 'Developer radar',
        providerStarters: [
          generated.InterestCoverageSourcePackProviderStarterDto(
            providerKey: 'reddit',
            label: 'Reddit AI/dev communities',
            keywords: ['AI agents'],
            queries: [],
            subreddits: ['LocalLLaMA'],
            topics: [],
            languages: [],
            rssFeedUrls: [],
          ),
        ],
      ),
      coverageGaps: const ['Add curated RSS feeds.'],
      skippedProviders: const [
        generated.InterestCoveragePlanSkippedProviderDto(
          providerKey: 'bluesky',
          reason: 'No coverage planner exists for this provider yet.',
        ),
      ],
      drafts: const [
        generated.InterestCoveragePlanDraftDto(
          providerKey: 'reddit',
          displayName: 'Reddit',
          status: generated.InterestCoveragePlanDraftDtoStatusStatus.ready,
          confidenceScore: 8,
          priority: 1,
          targetContentUnits: ['post', 'comment', 'link'],
          queryModes: ['search', 'listing'],
          rationale: ['Use search and subreddit listings.'],
          warnings: ['Keyword-wide comment search is not used.'],
          sourceBindingDraft: generated.InterestCoveragePlanBindingDraftDto(
            providerKey: 'reddit',
            config: {
              'mode': 'search',
              'query': '"Competitor launches" OR pricing',
              'scanPasses': [
                {
                  'mode': 'search',
                  'includeComments': true,
                  'maxCommentsPerPost': 5,
                },
              ],
            },
          ),
          cadenceSuggestion: generated.InterestCoveragePlanCadenceSuggestionDto(
            intervalSeconds: 1800,
            freshnessSeconds: 3600,
            retryBudget: 3,
          ),
          alternativeDrafts: [],
        ),
        generated.InterestCoveragePlanDraftDto(
          providerKey: 'hacker-news',
          displayName: 'Hacker News',
          status:
              generated.InterestCoveragePlanDraftDtoStatusStatus.alreadyBound,
          confidenceScore: 7,
          priority: 2,
          targetContentUnits: ['post', 'comment'],
          queryModes: ['search'],
          rationale: [],
          warnings: [],
          existingSourceBindingId: 'binding-hn',
          alternativeDrafts: [],
        ),
      ],
    );

    final plan = mapper.plan(response);

    expect(plan.interestId, 'interest-competitor');
    expect(plan.sourcePack?.key, 'ai_dev');
    expect(plan.sourcePack?.providerStarters.single.subreddits, ['LocalLLaMA']);
    expect(plan.coverageGaps, ['Add curated RSS feeds.']);
    expect(plan.skippedProviders.single.providerKey, 'bluesky');
    expect(plan.drafts.first.status, 'ready');
    expect(plan.drafts.first.sourceBindingDraft?.config['mode'], 'search');
    expect(
      plan.drafts.first.sourceBindingDraft?.config['scanPasses'],
      isA<List<Object?>>(),
    );
    expect(plan.drafts.last.status, 'already_bound');
    expect(plan.drafts.last.existingSourceBindingId, 'binding-hn');
  });

  test('builds generated request from non-empty hints only', () {
    const mapper = GeneratedInterestCoveragePlanRestMapper();

    final request = mapper.planRequest(
      const PlanInterestCoverageApiRequestDto(
        scope: WorkspaceScope(
          tenantId: 'tenant-demo',
          workspaceId: 'workspace-demo',
        ),
        interestId: 'interest-competitor',
        description: '  pricing changes  ',
        sourcePackKey: ' ai_dev ',
        keywords: ['pricing', ''],
        subreddits: ['SaaS'],
      ),
    );

    expect(request.description, 'pricing changes');
    expect(request.sourcePackKey, 'ai_dev');
    expect(request.keywords, ['pricing']);
    expect(request.subreddits, ['SaaS']);
    expect(request.rssFeedUrls, isNull);
  });
}
