import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/interest_mutation_api_dto.dart';
import '../api/interest_summary_api_dto.dart';
import '../mappers/generated_interest_rest_mapper.dart';
import 'in_memory_interests_api_client.dart';

final class GeneratedInterestsApiClient implements InterestsApiClient {
  GeneratedInterestsApiClient({
    required generated.GeneratedApiRuntime runtime,
    GeneratedInterestRestMapper mapper = const GeneratedInterestRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  factory GeneratedInterestsApiClient.fromRuntime({
    required Object runtime,
    GeneratedInterestRestMapper mapper = const GeneratedInterestRestMapper(),
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedInterestsApiClient(runtime: runtime, mapper: mapper);
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedInterestRestMapper _mapper;

  @override
  Future<Result<ListInterestsApiResponseDto>> listInterests(
    ListInterestsApiRequest request,
  ) async {
    final result = await _runtime.client
        .send<generated.ListInterestsResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () {
            return _runtime.rest.interests.interestControllerList(
              xWorkspaceId: request.scope.workspaceId,
              xTenantId: request.scope.tenantId,
              cursor: request.page.cursor,
              limit: request.page.limit,
            );
          },
        );

    return result.fold(
      onSuccess: (dto) {
        final response = _mapper.listInterests(dto);
        return Result.success(_filterLocally(response, request.search));
      },
      onFailure: Result<ListInterestsApiResponseDto>.failure,
    );
  }

  @override
  Future<Result<InterestSummaryApiDto>> createInterest(
    CreateInterestApiRequestDto request,
  ) async {
    final scope = request.scope;
    final result = await _runtime.client
        .send<generated.CreateInterestResponseDto>(
          generated.WorkspaceRequest(scope: scope),
          () {
            return _runtime.rest.interests.interestControllerCreate(
              idempotencyKey: request.idempotencyKey,
              xWorkspaceId: scope.workspaceId,
              xTenantId: scope.tenantId,
              body: _mapper.createInterest(request),
            );
          },
        );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.createdInterest(dto, request)),
      onFailure: Result<InterestSummaryApiDto>.failure,
    );
  }

  @override
  Future<Result<InterestSummaryApiDto>> updateInterest(
    UpdateInterestApiRequestDto request,
  ) async {
    final scope = request.scope;
    final result = await _runtime.client.send<generated.InterestResponseDto>(
      generated.WorkspaceRequest(scope: scope),
      () {
        return _runtime.rest.interests.interestControllerUpdate(
          interestId: request.id,
          xWorkspaceId: scope.workspaceId,
          xTenantId: scope.tenantId,
          body: _mapper.updateInterest(request),
        );
      },
    );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.interest(dto)),
      onFailure: Result<InterestSummaryApiDto>.failure,
    );
  }

  @override
  Future<Result<InterestSummaryApiDto>> archiveInterest(
    ArchiveInterestApiRequestDto request,
  ) async {
    final scope = request.scope;
    final result = await _runtime.client.send<generated.InterestResponseDto>(
      generated.WorkspaceRequest(scope: scope),
      () {
        return _runtime.rest.interests.interestControllerArchive(
          interestId: request.id,
          xWorkspaceId: scope.workspaceId,
          xTenantId: scope.tenantId,
        );
      },
    );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.interest(dto)),
      onFailure: Result<InterestSummaryApiDto>.failure,
    );
  }

  ListInterestsApiResponseDto _filterLocally(
    ListInterestsApiResponseDto response,
    String search,
  ) {
    final normalized = search.trim().toLowerCase();
    if (normalized.isEmpty) {
      return response;
    }
    return ListInterestsApiResponseDto(
      items: response.items
          .where((item) {
            return (item.name ?? '').toLowerCase().contains(normalized) ||
                (item.query ?? '').toLowerCase().contains(normalized);
          })
          .toList(growable: false),
      nextCursor: response.nextCursor,
      isPartial: response.nextCursor != null,
    );
  }
}
