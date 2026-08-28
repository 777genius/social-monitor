import 'dart:convert';

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

  Future<Result<WorkspaceSummaryApiDto>> loadById(
    LoadPublishedSummaryApiRequest request,
  ) async {
    final result = await _runtime.client
        .send<generated.ReaderSummaryResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.readerSummaries.readerSummaryControllerGet(
            readerSummaryId: request.summaryId,
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
          ),
        );
    return result.fold(
      onSuccess: (dto) {
        final artifactJson = jsonDecode(jsonEncode(dto.toJson()));
        final artifact = generated.ReaderSummaryArtifactResponseDto.fromJson(
          (artifactJson as Map<String, dynamic>).cast<String, Object?>(),
        );
        final current = _mapper.readerSummary(artifact);
        return Result.success(
          WorkspaceSummaryApiDto(
            current: current,
            availablePeriods: [current.period],
          ),
        );
      },
      onFailure: Result<WorkspaceSummaryApiDto>.failure,
    );
  }

  Future<Result<WorkspaceSummaryApiDto>> load(
    LoadWorkspaceSummaryApiRequest request,
  ) async {
    if (request.allowLatestFallback) {
      final latestResult = await _list(request, exactPeriod: false);
      return latestResult.fold(
        onSuccess: (dto) => Result.success(_workspaceSummaryFrom(dto)),
        onFailure: Result<WorkspaceSummaryApiDto>.failure,
      );
    }

    final exactResult = await _list(request, exactPeriod: true);
    return exactResult.fold(
      onSuccess: (dto) => Result.success(_workspaceSummaryFrom(dto)),
      onFailure: Result<WorkspaceSummaryApiDto>.failure,
    );
  }

  Future<Result<WorkspaceSummaryApiDto>> loadHistory(
    LoadWorkspaceSummaryApiRequest request,
  ) async {
    final periodsResult = await _listPeriods(request, limit: _historyLimit);
    return periodsResult.fold(
      onSuccess: (periodsDto) {
        final references = _availableReferencesFromPeriodSummaries(periodsDto);
        return Result.success(
          WorkspaceSummaryApiDto(
            availablePeriods: references
                .map((reference) => reference.period)
                .toList(growable: false),
            availableSummaryReferences: references,
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
      availableSummaryReferences: current == null
          ? const []
          : [
              PublishedSummaryReferenceApiDto(
                summaryId: current.id,
                period: current.period,
              ),
            ],
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

  List<PublishedSummaryReferenceApiDto> _availableReferencesFromPeriodSummaries(
    generated.ListReaderSummaryPeriodsResponseDto dto,
  ) {
    final referencesByKey = <String, PublishedSummaryReferenceApiDto>{};
    for (final item in dto.items) {
      final period = _mapper.readerSummaryPeriod(item.period);
      referencesByKey[_periodIdentity(
        period,
      )] = PublishedSummaryReferenceApiDto(
        summaryId: item.readerSummaryId,
        period: period,
      );
    }

    return referencesByKey.values.toList(growable: false);
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
