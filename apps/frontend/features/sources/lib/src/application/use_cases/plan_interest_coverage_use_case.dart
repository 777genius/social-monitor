import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/interest_coverage_plan.dart';
import '../contracts/interest_coverage_plan_catalog.dart';
import '../queries/plan_interest_coverage_query.dart';

final class PlanInterestCoverageUseCase {
  const PlanInterestCoverageUseCase(this._catalog);

  final InterestCoveragePlanCatalog _catalog;

  Future<Result<InterestCoveragePlan>> call(PlanInterestCoverageQuery query) {
    if (!query.scope.isValid || !query.interestId.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Valid workspace and interest are required',
            code: 'interest_coverage_plan.request_invalid',
          ),
        ),
      );
    }
    return _catalog.planInterestCoverage(query);
  }
}
