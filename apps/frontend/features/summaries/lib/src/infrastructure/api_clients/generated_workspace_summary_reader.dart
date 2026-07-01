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
        final historyResult = await _list(
          request,
          exactPeriod: false,
          limit: 120,
        );
        return historyResult.fold(
          onSuccess: (historyDto) {
            final currentDto = dto.items.isNotEmpty
                ? dto
                : _historyForRequestedPeriod(historyDto, request.period);
            return Result.success(
              _workspaceSummaryFrom(currentDto, historyDto),
            );
          },
          onFailure: (failure) {
            if (dto.items.isNotEmpty) {
              return Result.success(_workspaceSummaryFrom(dto));
            }
            return Result.failure(failure);
          },
        );
      },
      onFailure: Result<WorkspaceSummaryApiDto>.failure,
    );
  }

  generated.ListReaderSummariesResponseDto _historyForRequestedPeriod(
    generated.ListReaderSummariesResponseDto dto,
    SummaryPeriod period,
  ) {
    return generated.ListReaderSummariesResponseDto(
      items: dto.items
          .where(
            (item) => _periodMatchesRequest(
              _mapper.readerSummary(item).period,
              period,
            ),
          )
          .toList(growable: false),
      nextCursor: dto.nextCursor,
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
        timezone: exactPeriod ? request.period.timezone : null,
        periodEndedAt: exactPeriod ? _queryDate(request.period.endedAt) : null,
        periodStartedAt: exactPeriod
            ? _queryDate(request.period.startedAt)
            : null,
        cadence: exactPeriod ? _listCadence(request.period.cadence) : null,
        limit: limit,
      ),
    );
  }

  WorkspaceSummaryApiDto _workspaceSummaryFrom(
    generated.ListReaderSummariesResponseDto currentDto, [
    generated.ListReaderSummariesResponseDto? historyDto,
  ]) {
    final current = currentDto.items.isEmpty
        ? null
        : _mapper.readerSummary(currentDto.items.first);
    final periods = _availablePeriods(
      current: current,
      historyDto: historyDto ?? currentDto,
    );
    return WorkspaceSummaryApiDto(current: current, availablePeriods: periods);
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

  bool _periodMatchesRequest(
    SummaryPeriodApiDto actual,
    SummaryPeriod requested,
  ) {
    return actual.cadence == requested.cadence.name &&
        actual.timezone == requested.timezone &&
        _durationDays(actual.startedAt, actual.endedAt) ==
            _durationDays(requested.startedAt, requested.endedAt);
  }

  int _durationDays(DateTime startedAt, DateTime endedAt) {
    return endedAt.toUtc().difference(startedAt.toUtc()).inDays;
  }
}
