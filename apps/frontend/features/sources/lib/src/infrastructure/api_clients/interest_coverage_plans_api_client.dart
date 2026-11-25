import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/interest_coverage_plan_api_dto.dart';

abstract interface class InterestCoveragePlansApiClient {
  Future<Result<InterestCoveragePlanApiDto>> planInterestCoverage(
    PlanInterestCoverageApiRequestDto request,
  );
}
