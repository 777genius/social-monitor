import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/queries/load_weekly_summary_projection_query.dart';
import '../../application/use_cases/load_weekly_summary_projection_use_case.dart';
import '../../domain/aggregates/weekly_summary_projection.dart';
import '../../domain/value_objects/weekly_summary_week.dart';

final class WeeklySummariesStore extends ChangeNotifier {
  WeeklySummariesStore({
    required WorkspaceScope scope,
    required WeeklySummaryWeek initialWeek,
    required LoadWeeklySummaryProjectionUseCase loadProjection,
    OperationGenerationGuard? generationGuard,
    WorkspaceRequestGuard? workspaceGuard,
  }) : _scope = scope,
       _week = initialWeek,
       _loadProjection = loadProjection,
       _generationGuard = generationGuard ?? OperationGenerationGuard(),
       _workspaceGuard = workspaceGuard ?? WorkspaceRequestGuard(scope);

  WorkspaceScope _scope;
  WeeklySummaryWeek _week;
  final LoadWeeklySummaryProjectionUseCase _loadProjection;
  final OperationGenerationGuard _generationGuard;
  final WorkspaceRequestGuard _workspaceGuard;

  AsyncViewState<WeeklySummaryProjection> _state =
      const InitialViewState<WeeklySummaryProjection>();

  AsyncViewState<WeeklySummaryProjection> get state => _state;

  WorkspaceScope get scope => _scope;

  WeeklySummaryWeek get week => _week;

  Future<void> load() => _loadWeek(_week);

  Future<void> showPreviousWeek() => _loadWeek(_week.previous());

  Future<void> showNextWeek() => _loadWeek(_week.next());

  Future<void> retry() => _loadWeek(_week, isRetry: true);

  void replaceWorkspaceScope(WorkspaceScope scope) {
    if (scope == _scope) {
      return;
    }
    _scope = scope;
    _workspaceGuard.replaceScope(scope);
    _generationGuard.invalidate();
    _state = const InitialViewState<WeeklySummaryProjection>();
    notifyListeners();
  }

  Future<void> _loadWeek(
    WeeklySummaryWeek requestedWeek, {
    bool isRetry = false,
  }) async {
    final operationGeneration = _generationGuard.markOperationStarted();
    final workspaceGeneration = _workspaceGuard.markRequestStarted();
    final requestedScope = _scope;
    _week = requestedWeek;
    _state = isRetry
        ? const RetryingViewState<WeeklySummaryProjection>()
        : const LoadingViewState<WeeklySummaryProjection>();
    notifyListeners();

    final result = await _loadProjection(
      LoadWeeklySummaryProjectionQuery(
        scope: requestedScope,
        week: requestedWeek,
      ),
    );
    if (!_generationGuard.isCurrent(operationGeneration) ||
        _workspaceGuard.staleFailureFor(workspaceGeneration) != null ||
        _scope != requestedScope ||
        _week != requestedWeek) {
      return;
    }

    _state = result.fold(
      onSuccess: (projection) {
        if (projection.scope != requestedScope || projection.week != requestedWeek) {
          return const FailureViewState<WeeklySummaryProjection>(
            failure: ValidationFailure(
              message: 'Weekly summary response did not match its request.',
              code: 'summaries.weekly_returned_scope_or_week_mismatch',
            ),
            canRetry: true,
          );
        }
        return ReadyViewState<WeeklySummaryProjection>(
          projection,
          isPartial: projection.status != WeeklySummaryProjectionStatus.complete,
          isDegraded: projection.status != WeeklySummaryProjectionStatus.complete,
        );
      },
      onFailure: _stateForFailure,
    );
    notifyListeners();
  }

  AsyncViewState<WeeklySummaryProjection> _stateForFailure(
    AppFailure failure,
  ) {
    return switch (failure) {
      UnauthorizedFailure() || ForbiddenFailure() =>
        PermissionRequiredViewState<WeeklySummaryProjection>(
          permissionKey: failure.code ?? 'summaries.weekly_access_required',
          message: 'You need summary access for this workspace.',
        ),
      _ => FailureViewState<WeeklySummaryProjection>(failure: failure),
    };
  }

  @override
  void dispose() {
    _generationGuard.invalidate();
    super.dispose();
  }
}
