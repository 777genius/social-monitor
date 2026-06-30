import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/source_binding_api_dto.dart';
import '../api/source_binding_health_api_dto.dart';
import '../mappers/generated_source_binding_rest_mapper.dart';
import 'source_bindings_api_client.dart';

final class GeneratedSourceBindingsApiClient
    implements SourceBindingsApiClient {
  GeneratedSourceBindingsApiClient({
    required generated.GeneratedApiRuntime runtime,
    GeneratedSourceBindingRestMapper mapper =
        const GeneratedSourceBindingRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  factory GeneratedSourceBindingsApiClient.fromRuntime({
    required Object runtime,
    GeneratedSourceBindingRestMapper mapper =
        const GeneratedSourceBindingRestMapper(),
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedSourceBindingsApiClient(runtime: runtime, mapper: mapper);
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedSourceBindingRestMapper _mapper;

  @override
  Future<Result<ListSourceBindingsApiResponseDto>> listSourceBindings(
    SourceBindingListApiRequestDto request,
  ) async {
    final result = await _runtime.client
        .send<generated.ListSourceBindingsResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.sourceBindings.sourceBindingControllerList(
            interestId: request.interestId,
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
            cursor: request.page.cursor,
            limit: request.page.limit,
          ),
        );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.listSourceBindings(dto)),
      onFailure: Result<ListSourceBindingsApiResponseDto>.failure,
    );
  }

  @override
  Future<Result<SourceBindingApiDto>> bindSource(
    BindSourceApiRequestDto request,
  ) async {
    final createResult = await _runtime.client
        .send<generated.BindSourceResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.sourceBindings.sourceBindingControllerCreate(
            interestId: request.interestId,
            idempotencyKey: request.idempotencyKey,
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
            body: _mapper.bindSource(request),
          ),
        );

    return createResult.fold(
      onSuccess: (created) async {
        final listResult = await listSourceBindings(
          SourceBindingListApiRequestDto(
            scope: request.scope,
            interestId: request.interestId,
            page: const PageRequest(),
          ),
        );
        return listResult.fold(
          onSuccess: (response) {
            for (final binding in response.items) {
              if (binding.id == created.sourceBindingId) {
                return Result.success(binding);
              }
            }
            return Result.success(
              _syntheticBinding(created.sourceBindingId, request),
            );
          },
          onFailure: Result<SourceBindingApiDto>.failure,
        );
      },
      onFailure: (failure) async => Result.failure(failure),
    );
  }

  @override
  Future<Result<SourceBindingApiDto>> changeSourceBindingStatus(
    ChangeSourceBindingStatusApiRequestDto request,
  ) async {
    final result = await _runtime.client
        .send<generated.ChangeSourceBindingStatusResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () =>
              _runtime.rest.sourceBindings.sourceBindingControllerUpdateStatus(
                interestId: request.interestId,
                sourceBindingId: request.sourceBindingId,
                idempotencyKey: request.idempotencyKey,
                xWorkspaceId: request.scope.workspaceId,
                xTenantId: request.scope.tenantId,
                body: _mapper.changeStatus(request),
              ),
        );

    return result.fold(
      onSuccess: (_) async {
        final health = await loadSourceBindingHealth(
          SourceBindingHealthApiRequestDto(
            scope: request.scope,
            interestId: request.interestId,
            sourceBindingId: request.sourceBindingId,
          ),
        );
        return health.fold(
          onSuccess: (snapshot) => Result.success(snapshot.sourceBinding),
          onFailure: Result<SourceBindingApiDto>.failure,
        );
      },
      onFailure: (failure) async => Result.failure(failure),
    );
  }

  @override
  Future<Result<SourceBindingHealthApiDto>> loadSourceBindingHealth(
    SourceBindingHealthApiRequestDto request,
  ) async {
    final result = await _runtime.client
        .send<generated.SourceBindingHealthResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.sourceBindings.sourceBindingControllerHealth(
            interestId: request.interestId,
            sourceBindingId: request.sourceBindingId,
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
          ),
        );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.health(dto)),
      onFailure: Result<SourceBindingHealthApiDto>.failure,
    );
  }

  @override
  Future<Result<SourceBindingOverviewApiDto>> loadSourceBindingOverview(
    SourceBindingOverviewApiRequestDto request,
  ) async {
    final result = await _runtime.client
        .send<generated.ListSourceBindingOverviewResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.sourceBindings.sourceBindingControllerOverview(
            interestId: request.interestId,
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
            cursor: request.page.cursor,
            limit: request.page.limit,
          ),
        );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.overview(dto)),
      onFailure: Result<SourceBindingOverviewApiDto>.failure,
    );
  }

  SourceBindingApiDto _syntheticBinding(
    String sourceBindingId,
    BindSourceApiRequestDto request,
  ) {
    return SourceBindingApiDto(
      id: sourceBindingId,
      interestId: request.interestId,
      providerKey: request.providerKey,
      capabilityProfileVersion: 0,
      status: 'enabled',
      configPreview: request.config,
      createdAt: DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
    );
  }
}
