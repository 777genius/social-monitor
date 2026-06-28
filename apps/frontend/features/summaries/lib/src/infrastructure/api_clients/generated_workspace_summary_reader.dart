import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/summary_period.dart';
import '../api/summary_api_dto.dart';
import '../mappers/generated_summary_rest_mapper.dart';
import 'summaries_api_client.dart';

final class GeneratedWorkspaceSummaryReader {
  const GeneratedWorkspaceSummaryReader({
    required generated.GeneratedApiRuntime runtime,
    required GeneratedSummaryRestMapper mapper,
  }) : _runtime = runtime,
       _mapper = mapper;

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedSummaryRestMapper _mapper;

  Future<Result<WorkspaceSummaryApiDto>> load(
    LoadWorkspaceSummaryApiRequest request,
  ) async {
    final exactResult = await _list(request, exactPeriod: true);
    return exactResult.fold(
      onSuccess: (dto) async {
        if (dto.items.isNotEmpty) {
          return Result.success(_workspaceSummaryFrom(dto));
        }
        final latestResult = await _list(request, exactPeriod: false);
        return latestResult.fold(
          onSuccess: (latestDto) =>
              Result.success(_workspaceSummaryFrom(latestDto)),
          onFailure: Result<WorkspaceSummaryApiDto>.failure,
        );
      },
      onFailure: Result<WorkspaceSummaryApiDto>.failure,
    );
  }

  Future<Result<generated.ListReaderSummariesResponseDto>> _list(
    LoadWorkspaceSummaryApiRequest request, {
    required bool exactPeriod,
  }) {
    return _runtime.client.send<generated.ListReaderSummariesResponseDto>(
      generated.WorkspaceRequest(scope: request.scope),
      () => _runtime.rest.readerSummaries.readerSummaryControllerList(
        xWorkspaceId: request.scope.workspaceId,
        xTenantId: request.scope.tenantId,
        scopeType: generated.ScopeType.workspace,
        timezone: exactPeriod ? request.period.timezone : null,
        periodEndedAt: exactPeriod ? _queryDate(request.period.endedAt) : null,
        periodStartedAt: exactPeriod
            ? _queryDate(request.period.startedAt)
            : null,
        cadence: exactPeriod ? _listCadence(request.period.cadence) : null,
        limit: 1,
      ),
    );
  }

  WorkspaceSummaryApiDto _workspaceSummaryFrom(
    generated.ListReaderSummariesResponseDto dto,
  ) {
    return WorkspaceSummaryApiDto(
      current: dto.items.isEmpty
          ? null
          : _mapper.readerSummary(dto.items.first),
    );
  }

  generated.Cadence _listCadence(SummaryPeriodCadence cadence) {
    return switch (cadence) {
      SummaryPeriodCadence.daily => generated.Cadence.daily,
      SummaryPeriodCadence.weekly => generated.Cadence.weekly,
      SummaryPeriodCadence.monthly => generated.Cadence.monthly,
      SummaryPeriodCadence.custom => generated.Cadence.custom,
      SummaryPeriodCadence.unknown => generated.Cadence.$unknown,
    };
  }

  String _queryDate(DateTime value) => value.toUtc().toIso8601String();
}
