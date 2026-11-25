import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/summary_preference_api_dto.dart';
import '../mappers/generated_summary_preference_rest_mapper.dart';
import 'summary_preference_api_client.dart';

final class GeneratedSummaryPreferenceApiClient
    implements SummaryPreferenceApiClient {
  GeneratedSummaryPreferenceApiClient({
    required generated.GeneratedApiRuntime runtime,
    GeneratedSummaryPreferenceRestMapper mapper =
        const GeneratedSummaryPreferenceRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  factory GeneratedSummaryPreferenceApiClient.fromRuntime({
    required Object runtime,
    GeneratedSummaryPreferenceRestMapper mapper =
        const GeneratedSummaryPreferenceRestMapper(),
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedSummaryPreferenceApiClient(
      runtime: runtime,
      mapper: mapper,
    );
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedSummaryPreferenceRestMapper _mapper;

  @override
  Future<Result<SummaryPreferenceApiDto>> loadSummaryPreference(
    LoadSummaryPreferenceApiRequest request,
  ) async {
    final scope = request.scope;
    final result = await _runtime.client
        .send<generated.GetEffectiveUserSummaryPreferenceResponseDto>(
          generated.WorkspaceRequest(scope: scope),
          () => _runtime.rest.userSummaryPreferences
              .userSummaryPreferencesControllerGetEffectiveInterestSummaryPreference(
                interestId: workspaceSummaryPreferenceInterestId,
                userId: request.userId.trim(),
                xWorkspaceId: scope.workspaceId,
                xTenantId: scope.tenantId,
              ),
        );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.fromEffective(dto)),
      onFailure: Result<SummaryPreferenceApiDto>.failure,
    );
  }

  @override
  Future<Result<SummaryPreferenceApiDto>> saveSummaryPreference(
    SaveSummaryPreferenceApiRequest request,
  ) async {
    final scope = request.scope;
    final body = _mapper.toUpsertBody(request);
    final result = await _runtime.client
        .send<generated.UpsertUserSummaryPreferenceResponseDto>(
          generated.WorkspaceRequest(scope: scope),
          () => _runtime.rest.userSummaryPreferences
              .userSummaryPreferencesControllerUpsertInterestSummaryPreference(
                interestId: workspaceSummaryPreferenceInterestId,
                xWorkspaceId: scope.workspaceId,
                xTenantId: scope.tenantId,
                body: body,
              ),
        );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.fromUpsert(dto)),
      onFailure: Result<SummaryPreferenceApiDto>.failure,
    );
  }
}
