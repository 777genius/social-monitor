part of 'summaries_review_store.dart';

Future<void> _loadWorkspaceSummaryHistoryForStore(
  SummariesReviewStore store,
  int generation,
  WorkspaceSummarySnapshot currentSnapshot,
) async {
  Result<WorkspaceSummarySnapshot> result;
  try {
    result = await store._dependencies.loadWorkspaceSummaryHistory(
      LoadWorkspaceSummaryQuery(
        scope: store._scope,
        period: store.selectedSummaryPeriod,
      ),
    );
  } on Object catch (error) {
    result = Result.failure(
      UnexpectedFailure(
        message: 'Workspace summary history failed to load.',
        code: 'summaries.workspace_summary_history_unexpected_failure',
        cause: error,
      ),
    );
  }
  if (!store._summaryGenerationGuard.isCurrent(generation)) {
    return;
  }

  final history = result.fold<WorkspaceSummarySnapshot?>(
    onSuccess: (snapshot) => snapshot,
    onFailure: (_) => null,
  );
  if (history == null) {
    return;
  }

  final state = store.workspaceSummaryState;
  if (state is! ReadyViewState<WorkspaceSummarySnapshot>) {
    return;
  }

  final current =
      state.value.current ?? history.current ?? currentSnapshot.current;
  store.workspaceSummaryState = ReadyViewState<WorkspaceSummarySnapshot>(
    WorkspaceSummarySnapshot(
      current: current,
      availablePeriods: [
        ..._snapshotSummaryPeriods(currentSnapshot),
        ..._snapshotSummaryPeriods(history),
      ],
      availablePeriodsAreComplete: true,
    ),
  );
  store._notifyStateChanged();
}
