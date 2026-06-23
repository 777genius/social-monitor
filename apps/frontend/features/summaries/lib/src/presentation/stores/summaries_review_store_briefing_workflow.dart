part of 'summaries_review_store.dart';

extension SummariesReviewStoreBriefingWorkflow on SummariesReviewStore {
  bool get isBriefingGenerationInProgress {
    final state = briefingJobState;
    return state is LoadingViewState<BriefingJobSnapshot> ||
        (state is ReadyViewState<BriefingJobSnapshot> &&
            state.value.status.isPending);
  }

  UserActionIntent requestWorkspaceBriefingIntent() {
    final disabledReasonCode = !_scope.isValid
        ? 'summaries.workspace_scope_required'
        : isBriefingGenerationInProgress
        ? 'summaries.briefing_generation_in_progress'
        : null;
    return UserActionIntent(
      id: 'summaries.workspace_briefing.request',
      risk: UserActionRisk.expensive,
      disabledReasonCode: disabledReasonCode,
    );
  }

  Future<void> requestWorkspaceBriefing() async {
    final intent = requestWorkspaceBriefingIntent();
    if (!intent.isEnabled) {
      return;
    }
    final generation = _briefingGenerationGuard.markOperationStarted();
    final previous = switch (briefingJobState) {
      ReadyViewState<BriefingJobSnapshot>(:final value) => value,
      LoadingViewState<BriefingJobSnapshot>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    briefingJobState = LoadingViewState<BriefingJobSnapshot>(
      previousValue: previous,
    );
    _notifyStateChanged();

    final result = await _requestWorkspaceBriefing(
      RequestWorkspaceBriefingCommand(
        scope: _scope,
        idempotencyKey: _briefingRequestIdempotencyKeyFactory(_scope),
      ),
    );
    if (!_briefingGenerationGuard.isCurrent(generation)) {
      return;
    }

    final job = result.fold<BriefingJobSnapshot?>(
      onSuccess: (job) {
        briefingJobState = ReadyViewState<BriefingJobSnapshot>(job);
        _notifyStateChanged();
        return job;
      },
      onFailure: (failure) {
        briefingJobState = FailureViewState<BriefingJobSnapshot>(
          failure: failure,
        );
        _notifyStateChanged();
        return null;
      },
    );
    if (job == null) {
      return;
    }

    await _pollWorkspaceBriefingJob(job, generation);
  }

  Future<void> _pollWorkspaceBriefingJob(
    BriefingJobSnapshot initialJob,
    int generation,
  ) async {
    var current = initialJob;
    for (var attempt = 0; attempt < _briefingPollAttempts; attempt += 1) {
      if (current.status.isTerminal) {
        await _completeWorkspaceBriefingJob(current, generation);
        return;
      }
      if (attempt > 0 && _briefingPollInterval > Duration.zero) {
        await Future<void>.delayed(_briefingPollInterval);
      }
      if (!_briefingGenerationGuard.isCurrent(generation)) {
        return;
      }

      final result = await _loadWorkspaceBriefingJobStatus(
        LoadWorkspaceBriefingJobStatusQuery(
          scope: _scope,
          briefingJobId: current.id,
        ),
      );
      if (!_briefingGenerationGuard.isCurrent(generation)) {
        return;
      }

      final shouldStop = result.fold(
        onSuccess: (snapshot) {
          current = snapshot;
          briefingJobState = ReadyViewState<BriefingJobSnapshot>(snapshot);
          _notifyStateChanged();
          return snapshot.status.isTerminal;
        },
        onFailure: (failure) {
          briefingJobState = FailureViewState<BriefingJobSnapshot>(
            failure: failure,
          );
          _notifyStateChanged();
          return true;
        },
      );
      if (shouldStop) {
        await _completeWorkspaceBriefingJob(current, generation);
        return;
      }
    }

    briefingJobState = const FailureViewState<BriefingJobSnapshot>(
      failure: UnexpectedFailure(
        message: 'Briefing is still running. Try again shortly.',
        code: 'summaries.briefing_poll_timeout',
      ),
    );
    _notifyStateChanged();
  }

  Future<void> _completeWorkspaceBriefingJob(
    BriefingJobSnapshot job,
    int generation,
  ) async {
    if (!_briefingGenerationGuard.isCurrent(generation)) {
      return;
    }
    if (job.status.shouldRefreshBriefing) {
      await _loadWorkspaceBriefingForStore(this, generation);
    }
  }
}

Future<void> _loadWorkspaceBriefingForStore(
  SummariesReviewStore store,
  int generation,
) async {
  final previous = switch (store.briefingState) {
    ReadyViewState<WorkspaceBriefingSnapshot>(:final value) => value,
    LoadingViewState<WorkspaceBriefingSnapshot>(:final previousValue) =>
      previousValue,
    _ => null,
  };
  store.briefingState = LoadingViewState<WorkspaceBriefingSnapshot>(
    previousValue: previous,
  );
  store._notifyStateChanged();

  final result = await store._loadWorkspaceBriefing(
    LoadWorkspaceBriefingQuery(scope: store._scope),
  );
  if (!store._briefingGenerationGuard.isCurrent(generation)) {
    return;
  }

  store.briefingState = result.fold(
    onSuccess: (snapshot) {
      if (snapshot.current == null) {
        return const EmptyViewState<WorkspaceBriefingSnapshot>(
          reason: 'briefings.empty',
        );
      }
      return ReadyViewState<WorkspaceBriefingSnapshot>(snapshot);
    },
    onFailure: (failure) =>
        FailureViewState<WorkspaceBriefingSnapshot>(failure: failure),
  );
  store._notifyStateChanged();
}

String _defaultBriefingRequestIdempotencyKey(WorkspaceScope scope) {
  final timestamp = DateTime.now().microsecondsSinceEpoch;
  return '${scope.workspaceId}:workspace-briefing:$timestamp';
}
