part of 'summaries_review_store.dart';

extension SummariesReviewStoreReaderActionWorkflow on SummariesReviewStore {
  UserActionIntent readerActionIntentFor(
    ReaderSummary summary,
    ReaderAction action,
  ) {
    final sourceUri = _readerActionSourceUri(action);
    if (action.kind == 'read_source') {
      return UserActionIntent(
        id: 'summaries.reader_summary.read_source',
        disabledReasonCode: !_scope.isValid
            ? 'summaries.workspace_scope_required'
            : sourceUri == null
            ? 'summaries.reader_action_source_url_required'
            : null,
        idempotencyKey: _readerActionIdempotencyKey(
          summary: summary,
          action: action,
        ),
      );
    }

    final target = _readerActionTargetResolver.resolve(
      summary: summary,
      action: action,
    );
    final userId = summary.userId?.trim();
    final disabledReasonCode = !_scope.isValid
        ? 'summaries.workspace_scope_required'
        : !supportedReaderFeedbackActionKinds.contains(action.kind)
        ? 'summaries.reader_action_not_supported'
        : userId == null || userId.isEmpty
        ? 'summaries.reader_action_user_required'
        : target == null
        ? 'summaries.reader_action_target_required'
        : null;

    return UserActionIntent(
      id: 'summaries.reader_summary.${action.kind}',
      disabledReasonCode: disabledReasonCode,
      idempotencyKey: _readerActionIdempotencyKey(
        summary: summary,
        action: action,
      ),
    );
  }

  Future<void> submitReaderAction(
    ReaderSummary summary,
    ReaderAction action, [
    ReaderFeedbackReason? feedbackReason,
  ]) async {
    final intent = readerActionIntentFor(summary, action);
    if (!intent.isEnabled) {
      return;
    }
    final idempotencyKey = intent.idempotencyKey ?? '';
    if (action.kind == 'read_source') {
      await _openReaderSource(summary, action, idempotencyKey);
      return;
    }

    final target = _readerActionTargetResolver.resolve(
      summary: summary,
      action: action,
    );
    final userId = summary.userId?.trim();
    if (target == null || userId == null || userId.isEmpty) {
      return;
    }

    final generation = _readerActionGenerationGuard.markOperationStarted();
    _activeReaderActionIdempotencyKey = idempotencyKey;
    _lastReaderActionIdempotencyKey = idempotencyKey;
    final previous = switch (readerActionState) {
      ReadyViewState<ReaderActionResult>(:final value) => value,
      LoadingViewState<ReaderActionResult>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    readerActionState = LoadingViewState<ReaderActionResult>(
      previousValue: previous,
    );
    _notifyStateChanged();

    final result = await _dependencies.submitReaderAction(
      SubmitReaderActionCommand(
        scope: _scope,
        summaryId: summary.id,
        userId: userId,
        kind: action.kind,
        label: action.label,
        target: target,
        idempotencyKey: idempotencyKey,
        feedbackReason: feedbackReason,
      ),
    );
    if (!_readerActionGenerationGuard.isCurrent(generation)) {
      if (_activeReaderActionIdempotencyKey == idempotencyKey) {
        _activeReaderActionIdempotencyKey = null;
      }
      return;
    }

    _activeReaderActionIdempotencyKey = null;
    readerActionState = result.fold(
      onSuccess: ReadyViewState<ReaderActionResult>.new,
      onFailure: (failure) =>
          FailureViewState<ReaderActionResult>(failure: failure),
    );
    _notifyStateChanged();
  }

  Future<void> _openReaderSource(
    ReaderSummary summary,
    ReaderAction action,
    String idempotencyKey,
  ) async {
    final generation = _readerActionGenerationGuard.markOperationStarted();
    _activeReaderActionIdempotencyKey = idempotencyKey;
    _lastReaderActionIdempotencyKey = idempotencyKey;
    final previous = switch (readerActionState) {
      ReadyViewState<ReaderActionResult>(:final value) => value,
      LoadingViewState<ReaderActionResult>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    readerActionState = LoadingViewState<ReaderActionResult>(
      previousValue: previous,
    );
    _notifyStateChanged();

    final result = await _dependencies.openReaderSource(
      OpenReaderSourceCommand(
        summaryId: summary.id,
        kind: action.kind,
        label: action.label,
        canonicalUrl: action.canonicalUrl,
        idempotencyKey: idempotencyKey,
      ),
    );
    if (!_readerActionGenerationGuard.isCurrent(generation)) {
      if (_activeReaderActionIdempotencyKey == idempotencyKey) {
        _activeReaderActionIdempotencyKey = null;
      }
      return;
    }

    _activeReaderActionIdempotencyKey = null;
    readerActionState = result.fold(
      onSuccess: ReadyViewState<ReaderActionResult>.new,
      onFailure: (failure) =>
          FailureViewState<ReaderActionResult>(failure: failure),
    );
    _notifyStateChanged();
  }

  String _readerActionIdempotencyKey({
    required ReaderSummary summary,
    required ReaderAction action,
  }) {
    final targetKey = action.citationIds.isNotEmpty
        ? action.citationIds.join(',')
        : action.canonicalUrl ?? action.label;
    return '${_scope.workspaceId}:${summary.id}:${action.kind}:$targetKey';
  }

  Uri? _readerActionSourceUri(ReaderAction action) {
    final canonicalUrl = action.canonicalUrl?.trim();
    if (canonicalUrl == null || canonicalUrl.isEmpty) {
      return null;
    }
    final uri = Uri.tryParse(canonicalUrl);
    if (uri == null || uri.host.trim().isEmpty) {
      return null;
    }
    return uri.scheme == 'https' || uri.scheme == 'http' ? uri : null;
  }
}
