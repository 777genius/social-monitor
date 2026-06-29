import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/interest_coverage_plan_api_dto.dart';
import 'interest_coverage_plans_api_client.dart';

final class InMemoryInterestCoveragePlansApiClient
    implements InterestCoveragePlansApiClient {
  const InMemoryInterestCoveragePlansApiClient({required this.plan});

  final InterestCoveragePlanApiDto plan;

  @override
  Future<Result<InterestCoveragePlanApiDto>> planInterestCoverage(
    PlanInterestCoverageApiRequestDto request,
  ) async {
    return Result.success(
      InterestCoveragePlanApiDto(
        interestId: request.interestId,
        interestTitle: plan.interestTitle,
        planningQuery: plan.planningQuery,
        normalizedKeywords: plan.normalizedKeywords,
        drafts: plan.drafts,
        coverageGaps: plan.coverageGaps,
        skippedProviders: plan.skippedProviders,
      ),
    );
  }
}
