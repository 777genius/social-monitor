import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/scan_policy_api_dto.dart';
import '../mappers/generated_scan_policy_rest_mapper.dart';
import 'scan_policies_api_client.dart';

final class GeneratedScanPoliciesApiClient implements ScanPoliciesApiClient {
  GeneratedScanPoliciesApiClient({
    required generated.GeneratedApiRuntime runtime,
    GeneratedScanPolicyRestMapper mapper =
        const GeneratedScanPolicyRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  factory GeneratedScanPoliciesApiClient.fromRuntime({
    required Object runtime,
    GeneratedScanPolicyRestMapper mapper =
        const GeneratedScanPolicyRestMapper(),
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedScanPoliciesApiClient(runtime: runtime, mapper: mapper);
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedScanPolicyRestMapper _mapper;

  @override
  Future<Result<ScanPolicyApiDto>> loadScanPolicy(
    ScanPolicyApiRequestDto request,
  ) async {
    final result = await _runtime.client
        .send<generated.GetScanPolicyResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.scanPolicies.scanPolicyControllerGet(
            sourceBindingId: request.sourceBindingId,
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
          ),
        );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.policy(dto)),
      onFailure: Result<ScanPolicyApiDto>.failure,
    );
  }

  @override
  Future<Result<ScanPolicyApiDto>> setScanPolicy(
    SetScanPolicyApiRequestDto request,
  ) async {
    final result = await _runtime.client
        .send<generated.SetScanPolicyResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.scanPolicies.scanPolicyControllerCreate(
            sourceBindingId: request.sourceBindingId,
            idempotencyKey: request.idempotencyKey,
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
            body: _mapper.setPolicy(request),
          ),
        );
    return result.fold(
      onSuccess: (_) async => loadScanPolicy(
        ScanPolicyApiRequestDto(
          scope: request.scope,
          sourceBindingId: request.sourceBindingId,
        ),
      ),
      onFailure: (failure) async => Result.failure(failure),
    );
  }
}
