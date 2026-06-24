part of 'summaries_review_store.dart';

extension SummariesReviewStoreSummaryWorkflow on SummariesReviewStore {
  UserActionIntent regenerationIntentFor(GeneratedSummary summary) {
    final disabledReasonCode = switch (summary.status) {
      SummaryGenerationStatus.generating => 'summaries.generation_in_progress',
      SummaryGenerationStatus.unknown => 'summaries.status_unknown',
      _ => null,
    };
    return UserActionIntent(
      id: 'summaries.regenerate',
      disabledReasonCode: disabledReasonCode,
      idempotencyKey: '${_scope.workspaceId}:${summary.id.value}:regenerate',
    );
  }

  UserActionIntent feedbackIntentFor(
    GeneratedSummary summary,
    SummaryFeedbackKind kind,
  ) {
    return UserActionIntent(
      id: 'summaries.feedback.${kind.name}',
      disabledReasonCode: summary.feedbackSubmitted
          ? 'summaries.feedback_submitted'
          : null,
      idempotencyKey: '${_scope.workspaceId}:${summary.id.value}:${kind.name}',
    );
  }

  void clearSelection() {
    if (_selectedSummaryId == null) {
      return;
    }
    _selectedSummaryId = null;
    detailState = const InitialViewState<GeneratedSummary>();
    _notifyStateChanged();
  }

  bool selectSummaryById(SummaryId summaryId) {
    final list = listState;
    if (list is! ReadyViewState<PageResult<GeneratedSummary>>) {
      return false;
    }
    final exists = list.value.items.any((summary) => summary.id == summaryId);
    if (!exists) {
      return false;
    }
    selectSummary(summaryId);
    return true;
  }

  Future<void> selectSummary(SummaryId summaryId) async {
    _selectedSummaryId = summaryId;
    _notifyStateChanged();
    await loadDetail(summaryId);
  }

  Future<void> loadDetail(SummaryId summaryId) async {
    final generation = _detailGenerationGuard.markOperationStarted();
    final previous = switch (detailState) {
      ReadyViewState<GeneratedSummary>(:final value) => value,
      LoadingViewState<GeneratedSummary>(:final previousValue) => previousValue,
      _ => null,
    };
    detailState = LoadingViewState<GeneratedSummary>(previousValue: previous);
    _notifyStateChanged();

    final result = await _dependencies.loadSummaryDetail(
      LoadSummaryDetailQuery(scope: _scope, summaryId: summaryId),
    );
    if (!_detailGenerationGuard.isCurrent(generation)) {
      return;
    }

    detailState = result.fold(
      onSuccess: (summary) {
        _upsertSummary(summary);
        return ReadyViewState<GeneratedSummary>(summary);
      },
      onFailure: (failure) =>
          FailureViewState<GeneratedSummary>(failure: failure),
    );
    _notifyStateChanged();
  }

  Future<void> regenerate(GeneratedSummary summary) async {
    final intent = regenerationIntentFor(summary);
    if (!intent.isEnabled) {
      return;
    }
    await _mutate(
      loading: (previous) {
        regenerationState = LoadingViewState<GeneratedSummary>(
          previousValue: previous,
        );
      },
      run: () => _dependencies.regenerateSummary(
        RegenerateSummaryCommand(scope: _scope, summaryId: summary.id),
      ),
      apply: (result) {
        regenerationState = result.fold(
          onSuccess: (updated) {
            _upsertSummary(updated);
            return ReadyViewState<GeneratedSummary>(updated);
          },
          onFailure: (failure) =>
              FailureViewState<GeneratedSummary>(failure: failure),
        );
      },
    );
  }

  Future<void> submitFeedback(
    GeneratedSummary summary,
    SummaryFeedbackKind kind,
  ) async {
    final intent = feedbackIntentFor(summary, kind);
    if (!intent.isEnabled) {
      return;
    }
    await _mutate(
      loading: (previous) {
        feedbackState = LoadingViewState<GeneratedSummary>(
          previousValue: previous,
        );
      },
      run: () => _dependencies.submitFeedback(
        SubmitSummaryFeedbackCommand(
          scope: _scope,
          summaryId: summary.id,
          kind: kind,
        ),
      ),
      apply: (result) {
        feedbackState = result.fold(
          onSuccess: (updated) {
            _upsertSummary(updated);
            return ReadyViewState<GeneratedSummary>(updated);
          },
          onFailure: (failure) =>
              FailureViewState<GeneratedSummary>(failure: failure),
        );
      },
    );
  }

  Future<void> _mutate({
    required void Function(GeneratedSummary? previous) loading,
    required Future<Result<GeneratedSummary>> Function() run,
    required void Function(Result<GeneratedSummary> result) apply,
  }) async {
    final generation = _mutationGenerationGuard.markOperationStarted();
    loading(selectedSummary);
    _notifyStateChanged();

    final result = await run();
    if (!_mutationGenerationGuard.isCurrent(generation)) {
      return;
    }

    apply(result);
    _notifyStateChanged();
  }

  void _upsertSummary(GeneratedSummary updated) {
    final list = listState;
    if (list is ReadyViewState<PageResult<GeneratedSummary>>) {
      listState = ReadyViewState<PageResult<GeneratedSummary>>(
        PageResult<GeneratedSummary>(
          items: [
            for (final summary in list.value.items)
              summary.id == updated.id ? updated : summary,
          ],
          request: list.value.request,
          nextCursor: list.value.nextCursor,
          isPartial: list.value.isPartial,
        ),
      );
    }
    if (_selectedSummaryId == updated.id ||
        (_selectedSummaryId == null && selectedSummary?.id == updated.id)) {
      detailState = ReadyViewState<GeneratedSummary>(updated);
    }
  }
}
