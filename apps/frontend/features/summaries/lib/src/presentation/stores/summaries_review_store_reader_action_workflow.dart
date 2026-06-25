part of 'summaries_review_store.dart';

extension SummariesReviewStoreReaderActionWorkflow on SummariesReviewStore {
  UserActionIntent readerActionIntentFor(
    GeneratedBriefing briefing,
    BriefingNextAction action,
  ) {
    final sourceUri = _readerActionSourceUri(action);
    if (action.kind == 'read_source') {
      return UserActionIntent(
        id: 'summaries.reader_briefing.read_source',
        disabledReasonCode: !_scope.isValid
            ? 'summaries.workspace_scope_required'
            : sourceUri == null
            ? 'summaries.reader_action_source_url_required'
            : null,
        idempotencyKey: _readerActionIdempotencyKey(
          briefing: briefing,
          action: action,
        ),
      );
    }

    final target = _readerActionTargetResolver.resolve(
      briefing: briefing,
      action: action,
    );
    final userId = briefing.userId?.trim();
    final disabledReasonCode = !_scope.isValid
        ? 'summaries.workspace_scope_required'
        : !supportedBriefingReaderFeedbackActionKinds.contains(action.kind)
        ? 'summaries.reader_action_not_supported'
        : userId == null || userId.isEmpty
        ? 'summaries.reader_action_user_required'
        : target == null
        ? 'summaries.reader_action_target_required'
        : null;

    return UserActionIntent(
      id: 'summaries.reader_briefing.${action.kind}',
      disabledReasonCode: disabledReasonCode,
      idempotencyKey: _readerActionIdempotencyKey(
        briefing: briefing,
        action: action,
      ),
    );
  }

  Future<void> submitReaderAction(
    GeneratedBriefing briefing,
    BriefingNextAction action, [
    BriefingReaderFeedbackReason? feedbackReason,
  ]) async {
    final intent = readerActionIntentFor(briefing, action);
    if (!intent.isEnabled) {
      return;
    }
    final idempotencyKey = intent.idempotencyKey ?? '';
    if (action.kind == 'read_source') {
      await _openReaderSource(briefing, action, idempotencyKey);
      return;
    }

    final target = _readerActionTargetResolver.resolve(
      briefing: briefing,
      action: action,
    );
    final userId = briefing.userId?.trim();
    if (target == null || userId == null || userId.isEmpty) {
      return;
    }

    final generation = _readerActionGenerationGuard.markOperationStarted();
    _activeReaderActionIdempotencyKey = idempotencyKey;
    _lastReaderActionIdempotencyKey = idempotencyKey;
    final previous = switch (readerActionState) {
      ReadyViewState<BriefingReaderActionResult>(:final value) => value,
      LoadingViewState<BriefingReaderActionResult>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    readerActionState = LoadingViewState<BriefingReaderActionResult>(
      previousValue: previous,
    );
    _notifyStateChanged();

    final result = await _dependencies.submitBriefingReaderAction(
      SubmitBriefingReaderActionCommand(
        scope: _scope,
        briefingId: briefing.id,
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
      onSuccess: ReadyViewState<BriefingReaderActionResult>.new,
      onFailure: (failure) =>
          FailureViewState<BriefingReaderActionResult>(failure: failure),
    );
    _notifyStateChanged();
  }

  Future<void> _openReaderSource(
    GeneratedBriefing briefing,
    BriefingNextAction action,
    String idempotencyKey,
  ) async {
    final generation = _readerActionGenerationGuard.markOperationStarted();
    _activeReaderActionIdempotencyKey = idempotencyKey;
    _lastReaderActionIdempotencyKey = idempotencyKey;
    final previous = switch (readerActionState) {
      ReadyViewState<BriefingReaderActionResult>(:final value) => value,
      LoadingViewState<BriefingReaderActionResult>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    readerActionState = LoadingViewState<BriefingReaderActionResult>(
      previousValue: previous,
    );
    _notifyStateChanged();

    final result = await _dependencies.openBriefingReaderSource(
      OpenBriefingReaderSourceCommand(
        briefingId: briefing.id,
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
      onSuccess: ReadyViewState<BriefingReaderActionResult>.new,
      onFailure: (failure) =>
          FailureViewState<BriefingReaderActionResult>(failure: failure),
    );
    _notifyStateChanged();
  }

  String _readerActionIdempotencyKey({
    required GeneratedBriefing briefing,
    required BriefingNextAction action,
  }) {
    final targetKey = action.citationIds.isNotEmpty
        ? action.citationIds.join(',')
        : action.canonicalUrl ?? action.label;
    return '${_scope.workspaceId}:${briefing.id}:${action.kind}:$targetKey';
  }

  Uri? _readerActionSourceUri(BriefingNextAction action) {
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
