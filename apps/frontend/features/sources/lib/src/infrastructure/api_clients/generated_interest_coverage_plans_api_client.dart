import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/interest_coverage_plan_api_dto.dart';
import '../mappers/generated_interest_coverage_plan_rest_mapper.dart';
import 'interest_coverage_plans_api_client.dart';

final class GeneratedInterestCoveragePlansApiClient
    implements InterestCoveragePlansApiClient {
  GeneratedInterestCoveragePlansApiClient({
    required generated.GeneratedApiRuntime runtime,
    GeneratedInterestCoveragePlanRestMapper mapper =
        const GeneratedInterestCoveragePlanRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  factory GeneratedInterestCoveragePlansApiClient.fromRuntime({
    required Object runtime,
    GeneratedInterestCoveragePlanRestMapper mapper =
        const GeneratedInterestCoveragePlanRestMapper(),
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedInterestCoveragePlansApiClient(
      runtime: runtime,
      mapper: mapper,
    );
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedInterestCoveragePlanRestMapper _mapper;

  @override
  Future<Result<InterestCoveragePlanApiDto>> planInterestCoverage(
    PlanInterestCoverageApiRequestDto request,
  ) async {
    final result = await _runtime.client
        .send<generated.PlanInterestCoverageResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.interestCoveragePlans
              .interestCoveragePlanControllerPlan(
                interestId: request.interestId,
                xWorkspaceId: request.scope.workspaceId,
                xTenantId: request.scope.tenantId,
                body: _mapper.planRequest(request),
              ),
        );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.plan(dto)),
      onFailure: Result<InterestCoveragePlanApiDto>.failure,
    );
  }
}
