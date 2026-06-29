import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/interest_coverage_plan_catalog.dart';
import '../../application/queries/plan_interest_coverage_query.dart';
import '../../domain/entities/interest_coverage_plan.dart';
import '../api/interest_coverage_plan_api_dto.dart';
import '../api_clients/interest_coverage_plans_api_client.dart';
import '../mappers/interest_coverage_plan_mapper.dart';

final class GeneratedInterestCoveragePlanCatalog
    implements InterestCoveragePlanCatalog {
  const GeneratedInterestCoveragePlanCatalog({
    required InterestCoveragePlansApiClient apiClient,
    InterestCoveragePlanMapper mapper = const InterestCoveragePlanMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper;

  final InterestCoveragePlansApiClient _apiClient;
  final InterestCoveragePlanMapper _mapper;

  @override
  Future<Result<InterestCoveragePlan>> planInterestCoverage(
    PlanInterestCoverageQuery query,
  ) async {
    final result = await _apiClient.planInterestCoverage(
      PlanInterestCoverageApiRequestDto(
        scope: query.scope,
        interestId: query.interestId.value,
        description: query.description,
        keywords: query.keywords,
        subreddits: query.subreddits,
        rssFeedUrls: query.rssFeedUrls,
        includeProviders: query.includeProviders,
        excludeProviders: query.excludeProviders,
      ),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.plan(dto)),
      onFailure: Result<InterestCoveragePlan>.failure,
    );
  }
}
