import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/scan_run_api_dto.dart';
import '../mappers/generated_scan_run_rest_mapper.dart';
import 'scan_runs_api_client.dart';

final class GeneratedScanRunsApiClient implements ScanRunsApiClient {
  GeneratedScanRunsApiClient({
    required generated.GeneratedApiRuntime runtime,
    GeneratedScanRunRestMapper mapper = const GeneratedScanRunRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  factory GeneratedScanRunsApiClient.fromRuntime({
    required Object runtime,
    GeneratedScanRunRestMapper mapper = const GeneratedScanRunRestMapper(),
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedScanRunsApiClient(runtime: runtime, mapper: mapper);
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedScanRunRestMapper _mapper;

  @override
  Future<Result<RequestScanApiResponseDto>> requestScan(
    RequestScanApiRequestDto request,
  ) async {
    final result = await _runtime.client.send<generated.RequestScanResponseDto>(
      generated.WorkspaceRequest(scope: request.scope),
      () => _runtime.rest.scanRequests.scanRequestControllerCreate(
        sourceBindingId: request.sourceBindingId,
        idempotencyKey: request.idempotencyKey,
        xWorkspaceId: request.scope.workspaceId,
        xTenantId: request.scope.tenantId,
      ),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.request(dto)),
      onFailure: Result<RequestScanApiResponseDto>.failure,
    );
  }

  @override
  Future<Result<ScanStatusApiDto>> loadScanStatus(
    ScanStatusApiRequestDto request,
  ) async {
    final result = await _runtime.client.send<generated.ScanStatusResponseDto>(
      generated.WorkspaceRequest(scope: request.scope),
      () => _runtime.rest.scanRequests.scanStatusControllerGet(
        scanJobId: request.scanJobId,
        xWorkspaceId: request.scope.workspaceId,
        xTenantId: request.scope.tenantId,
      ),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.status(dto)),
      onFailure: Result<ScanStatusApiDto>.failure,
    );
  }
}
