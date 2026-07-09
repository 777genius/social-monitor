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

  static const _historyLimit = 40;

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
        if (!request.allowLatestFallback) {
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

  Future<Result<WorkspaceSummaryApiDto>> loadHistory(
    LoadWorkspaceSummaryApiRequest request,
  ) async {
    final periodsResult = await _listPeriods(request, limit: _historyLimit);
    return periodsResult.fold(
      onSuccess: (periodsDto) {
        return Result.success(
          WorkspaceSummaryApiDto(
            availablePeriods: _availablePeriodsFromPeriodSummaries(periodsDto),
            availablePeriodsAreComplete: true,
          ),
        );
      },
      onFailure: Result<WorkspaceSummaryApiDto>.failure,
    );
  }

  Future<Result<generated.ListReaderSummariesResponseDto>> _list(
    LoadWorkspaceSummaryApiRequest request, {
    required bool exactPeriod,
    num limit = 1,
  }) {
    return _runtime.client.send<generated.ListReaderSummariesResponseDto>(
      generated.WorkspaceRequest(scope: request.scope),
      () => _runtime.rest.readerSummaries.readerSummaryControllerList(
        xWorkspaceId: request.scope.workspaceId,
        xTenantId: request.scope.tenantId,
        scopeType: generated.ScopeType.workspace,
        timezone: request.period.timezone,
        periodEndedAt: exactPeriod ? _queryDate(request.period.endedAt) : null,
        periodStartedAt: exactPeriod
            ? _queryDate(request.period.startedAt)
            : null,
        cadence: _listCadence(request.period.cadence),
        limit: limit,
      ),
    );
  }

  Future<Result<generated.ListReaderSummaryPeriodsResponseDto>> _listPeriods(
    LoadWorkspaceSummaryApiRequest request, {
    num limit = 40,
  }) {
    return _runtime.client.send<generated.ListReaderSummaryPeriodsResponseDto>(
      generated.WorkspaceRequest(scope: request.scope),
      () => _runtime.rest.readerSummaries.readerSummaryControllerListPeriods(
        xWorkspaceId: request.scope.workspaceId,
        xTenantId: request.scope.tenantId,
        scopeType: generated.ScopeType.workspace,
        timezone: request.period.timezone,
        cadence: _listCadence(request.period.cadence),
        limit: limit,
      ),
    );
  }

  WorkspaceSummaryApiDto _workspaceSummaryFrom(
    generated.ListReaderSummariesResponseDto currentDto, {
    generated.ListReaderSummariesResponseDto? historyDto,
    bool availablePeriodsAreComplete = false,
  }) {
    final history = historyDto ?? currentDto;
    final current = currentDto.items.isEmpty
        ? null
        : _mapper.readerSummary(currentDto.items.first);
    final periods = _availablePeriods(current: current, historyDto: history);
    return WorkspaceSummaryApiDto(
      current: current,
      availablePeriods: periods,
      availablePeriodsAreComplete: availablePeriodsAreComplete,
    );
  }

  List<SummaryPeriodApiDto> _availablePeriods({
    required ReaderSummaryApiDto? current,
    required generated.ListReaderSummariesResponseDto historyDto,
  }) {
    final periodsByKey = <String, SummaryPeriodApiDto>{};
    void add(SummaryPeriodApiDto period) {
      periodsByKey[_periodIdentity(period)] = period;
    }

    if (current != null) {
      add(current.period);
    }
    for (final item in historyDto.items) {
      add(_mapper.readerSummary(item).period);
    }
    return periodsByKey.values.toList(growable: false);
  }

  List<SummaryPeriodApiDto> _availablePeriodsFromPeriodSummaries(
    generated.ListReaderSummaryPeriodsResponseDto dto,
  ) {
    final periodsByKey = <String, SummaryPeriodApiDto>{};
    for (final item in dto.items) {
      final period = _mapper.readerSummaryPeriod(item.period);
      periodsByKey[_periodIdentity(period)] = period;
    }

    return periodsByKey.values.toList(growable: false);
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

  String _periodIdentity(SummaryPeriodApiDto period) {
    return [
      period.cadence,
      period.startedAt.toUtc().toIso8601String(),
      period.endedAt.toUtc().toIso8601String(),
      period.timezone,
    ].join('|');
  }
}
