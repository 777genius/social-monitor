part of 'summaries_review_store.dart';

extension SummariesReviewStoreWorkspaceSummaryWorkflow on SummariesReviewStore {
  bool get isSummaryGenerationInProgress {
    final state = summaryJobState;
    return state is LoadingViewState<ReaderSummaryJobSnapshot> ||
        (state is ReadyViewState<ReaderSummaryJobSnapshot> &&
            state.value.status.isPending);
  }

  UserActionIntent requestWorkspaceSummaryIntent() {
    final disabledReasonCode = !_scope.isValid
        ? 'summaries.workspace_scope_required'
        : _userId.trim().isEmpty
        ? 'summaries.user_scope_required'
        : isSummaryGenerationInProgress
        ? 'summaries.summary_generation_in_progress'
        : null;
    return UserActionIntent(
      id: 'summaries.workspace_summary.request',
      risk: UserActionRisk.expensive,
      disabledReasonCode: disabledReasonCode,
    );
  }

  Future<void> requestWorkspaceSummary() async {
    final intent = requestWorkspaceSummaryIntent();
    if (!intent.isEnabled) {
      return;
    }
    final generation = _summaryGenerationGuard.markOperationStarted();
    final previous = switch (summaryJobState) {
      ReadyViewState<ReaderSummaryJobSnapshot>(:final value) => value,
      LoadingViewState<ReaderSummaryJobSnapshot>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    summaryJobState = LoadingViewState<ReaderSummaryJobSnapshot>(
      previousValue: previous,
    );
    _notifyStateChanged();

    final result = await _dependencies.requestWorkspaceSummary(
      RequestWorkspaceSummaryCommand(
        scope: _scope,
        userId: _userId,
        idempotencyKey: _summaryRequestIdempotencyKeyFactory(_scope),
      ),
    );
    if (!_summaryGenerationGuard.isCurrent(generation)) {
      return;
    }

    final job = result.fold<ReaderSummaryJobSnapshot?>(
      onSuccess: (job) {
        summaryJobState = ReadyViewState<ReaderSummaryJobSnapshot>(job);
        _notifyStateChanged();
        return job;
      },
      onFailure: (failure) {
        summaryJobState = FailureViewState<ReaderSummaryJobSnapshot>(
          failure: failure,
        );
        _notifyStateChanged();
        return null;
      },
    );
    if (job == null) {
      return;
    }

    await _pollWorkspaceSummaryJob(job, generation);
  }

  Future<void> _pollWorkspaceSummaryJob(
    ReaderSummaryJobSnapshot initialJob,
    int generation,
  ) async {
    var current = initialJob;
    for (var attempt = 0; attempt < _summaryPollAttempts; attempt += 1) {
      if (current.status.isTerminal) {
        await _completeWorkspaceSummaryJob(current, generation);
        return;
      }
      if (attempt > 0 && _summaryPollInterval > Duration.zero) {
        await Future<void>.delayed(_summaryPollInterval);
      }
      if (!_summaryGenerationGuard.isCurrent(generation)) {
        return;
      }

      final result = await _dependencies.loadWorkspaceSummaryJobStatus(
        LoadWorkspaceSummaryJobStatusQuery(
          scope: _scope,
          summaryJobId: current.id,
        ),
      );
      if (!_summaryGenerationGuard.isCurrent(generation)) {
        return;
      }

      final shouldStop = result.fold(
        onSuccess: (snapshot) {
          current = snapshot;
          summaryJobState = ReadyViewState<ReaderSummaryJobSnapshot>(snapshot);
          _notifyStateChanged();
          return snapshot.status.isTerminal;
        },
        onFailure: (failure) {
          summaryJobState = FailureViewState<ReaderSummaryJobSnapshot>(
            failure: failure,
          );
          _notifyStateChanged();
          return true;
        },
      );
      if (shouldStop) {
        await _completeWorkspaceSummaryJob(current, generation);
        return;
      }
    }

    summaryJobState = const FailureViewState<ReaderSummaryJobSnapshot>(
      failure: UnexpectedFailure(
        message: 'Summary is still running. Try again shortly.',
        code: 'summaries.summary_poll_timeout',
      ),
    );
    _notifyStateChanged();
  }

  Future<void> _completeWorkspaceSummaryJob(
    ReaderSummaryJobSnapshot job,
    int generation,
  ) async {
    if (!_summaryGenerationGuard.isCurrent(generation)) {
      return;
    }
    if (job.status.shouldRefreshSummary) {
      await _loadWorkspaceSummaryForStore(this, generation);
    }
  }
}

Future<void> _loadWorkspaceSummaryForStore(
  SummariesReviewStore store,
  int generation,
) async {
  final previous = switch (store.workspaceSummaryState) {
    ReadyViewState<WorkspaceSummarySnapshot>(:final value) => value,
    LoadingViewState<WorkspaceSummarySnapshot>(:final previousValue) =>
      previousValue,
    _ => null,
  };
  store.workspaceSummaryState = LoadingViewState<WorkspaceSummarySnapshot>(
    previousValue: previous,
  );
  store._notifyStateChanged();

  Result<WorkspaceSummarySnapshot> result;
  try {
    result = await store._dependencies
        .loadWorkspaceSummary(LoadWorkspaceSummaryQuery(scope: store._scope))
        .timeout(store._workspaceSummaryLoadTimeout);
  } on TimeoutException catch (error) {
    result = Result.failure(
      NetworkFailure(
        message: 'Workspace summary took too long to load.',
        code: 'summaries.workspace_summary_timeout',
        cause: error,
      ),
    );
  } on Object catch (error) {
    result = Result.failure(
      UnexpectedFailure(
        message: 'Workspace summary failed to load.',
        code: 'summaries.workspace_summary_unexpected_failure',
        cause: error,
      ),
    );
  }
  if (!store._summaryGenerationGuard.isCurrent(generation)) {
    return;
  }

  store.workspaceSummaryState = result.fold(
    onSuccess: (snapshot) {
      if (snapshot.current == null) {
        return const EmptyViewState<WorkspaceSummarySnapshot>(
          reason: 'summaries.workspace_summary_empty',
        );
      }
      return ReadyViewState<WorkspaceSummarySnapshot>(snapshot);
    },
    onFailure: (failure) =>
        FailureViewState<WorkspaceSummarySnapshot>(failure: failure),
  );
  store._notifyStateChanged();
}

String _defaultSummaryRequestIdempotencyKey(WorkspaceScope scope) {
  final timestamp = DateTime.now().microsecondsSinceEpoch;
  return '${scope.workspaceId}:workspace-summary:$timestamp';
}
