import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/summary_api_dto.dart';
import 'in_memory_reader_summary_period.dart';
import 'summaries_api_client.dart';

typedef InMemoryWorkspaceSummaryFailureReader =
    AppFailure? Function(WorkspaceScope scope);

final class InMemoryWorkspaceSummaryReader {
  const InMemoryWorkspaceSummaryReader({
    required ReaderSummaryApiDto? workspaceSummary,
    required List<SummaryPeriodApiDto> availablePeriods,
    required InMemoryWorkspaceSummaryFailureReader workspaceFailure,
  }) : _workspaceSummary = workspaceSummary,
       _availablePeriods = availablePeriods,
       _workspaceFailure = workspaceFailure;

  final ReaderSummaryApiDto? _workspaceSummary;
  final List<SummaryPeriodApiDto> _availablePeriods;
  final InMemoryWorkspaceSummaryFailureReader _workspaceFailure;

  Future<Result<WorkspaceSummaryApiDto>> load(
    LoadWorkspaceSummaryApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    final current = _workspaceSummary == null
        ? null
        : readerSummaryForPeriod(_workspaceSummary, request.period);

    return Result.success(
      WorkspaceSummaryApiDto(
        current: current,
        availablePeriods: _availablePeriods.isEmpty
            ? current == null
                  ? const []
                  : [current.period]
            : _availablePeriods,
        availablePeriodsAreComplete: _availablePeriods.isNotEmpty,
      ),
    );
  }

  Future<Result<WorkspaceSummaryApiDto>> loadHistory(
    LoadWorkspaceSummaryApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }

    return Result.success(
      WorkspaceSummaryApiDto(
        availablePeriods: _availablePeriods,
        availablePeriodsAreComplete: true,
      ),
    );
  }
}
