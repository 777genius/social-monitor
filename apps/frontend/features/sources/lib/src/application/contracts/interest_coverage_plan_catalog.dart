import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/interest_coverage_plan.dart';
import '../queries/plan_interest_coverage_query.dart';

abstract interface class InterestCoveragePlanCatalog {
  Future<Result<InterestCoveragePlan>> planInterestCoverage(
    PlanInterestCoverageQuery query,
  );
}
