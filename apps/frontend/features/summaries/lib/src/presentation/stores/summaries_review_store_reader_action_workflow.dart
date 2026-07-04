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

  Future<bool> submitTopPostRating(
    ReaderSummary summary,
    TopRead item,
    int rating,
    PostRatingReason? reason,
  ) async {
    if (rating < 1 || rating > 5) {
      return false;
    }
    if (postRatingRequiresReason(rating) && reason == null) {
      return false;
    }
    if (!_scope.isValid) {
      return false;
    }

    final userId = summary.userId?.trim();
    if (userId == null || userId.isEmpty) {
      return false;
    }

    final target = _topPostRatingTarget(summary, item);
    if (target == null || !target.isValid || !target.hasPostIdentity) {
      return false;
    }

    final idempotencyKey = _topPostRatingIdempotencyKey(
      summary: summary,
      target: target,
      rating: rating,
    );
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

    final result = await _dependencies.submitPostRating(
      SubmitPostRatingCommand(
        scope: _scope,
        summaryId: summary.id,
        userId: userId,
        target: target,
        rating: rating,
        reason: reason,
        idempotencyKey: idempotencyKey,
      ),
    );
    if (!_readerActionGenerationGuard.isCurrent(generation)) {
      if (_activeReaderActionIdempotencyKey == idempotencyKey) {
        _activeReaderActionIdempotencyKey = null;
      }
      return false;
    }

    _activeReaderActionIdempotencyKey = null;
    var submitted = false;
    readerActionState = result.fold(
      onSuccess: (value) {
        submitted = true;
        _rememberSubmittedTopPostRating(value.rating);
        final actionResult = ReaderActionResult(
          actionId: value.rating.feedbackId,
          idempotencyKey: idempotencyKey,
          kind: 'rate_post',
          created: value.created,
          learningDirection: value.learningDirection,
        );
        return ReadyViewState<ReaderActionResult>(actionResult);
      },
      onFailure: (failure) =>
          FailureViewState<ReaderActionResult>(failure: failure),
    );
    _notifyStateChanged();
    return submitted;
  }

  Future<void> openReaderSourceUrl({
    required String summaryId,
    required String canonicalUrl,
    String? label,
  }) async {
    final normalizedUrl = canonicalUrl.trim();
    if (normalizedUrl.isEmpty) {
      return;
    }
    final normalizedSummaryId = summaryId.trim().isEmpty
        ? _scope.workspaceId
        : summaryId.trim();
    await _openReaderSourceCommand(
      OpenReaderSourceCommand(
        summaryId: normalizedSummaryId,
        kind: 'read_source',
        label: label?.trim().isNotEmpty == true ? label!.trim() : normalizedUrl,
        canonicalUrl: normalizedUrl,
        idempotencyKey:
            '${_scope.workspaceId}:$normalizedSummaryId:read_source:$normalizedUrl',
      ),
    );
  }

  Future<void> _openReaderSource(
    ReaderSummary summary,
    ReaderAction action,
    String idempotencyKey,
  ) async {
    await _openReaderSourceCommand(
      OpenReaderSourceCommand(
        summaryId: summary.id,
        kind: action.kind,
        label: action.label,
        canonicalUrl: action.canonicalUrl,
        idempotencyKey: idempotencyKey,
      ),
    );
  }

  Future<void> _openReaderSourceCommand(OpenReaderSourceCommand command) async {
    final generation = _readerActionGenerationGuard.markOperationStarted();
    _activeReaderActionIdempotencyKey = command.idempotencyKey;
    _lastReaderActionIdempotencyKey = command.idempotencyKey;
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

    final result = await _dependencies.openReaderSource(command);
    if (!_readerActionGenerationGuard.isCurrent(generation)) {
      if (_activeReaderActionIdempotencyKey == command.idempotencyKey) {
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

  TopReadFeedbackTarget? _topPostRatingTarget(
    ReaderSummary summary,
    TopRead item,
  ) {
    final interestId = item.matchedInterestIds.firstOrNull;
    if (interestId == null || interestId.trim().isEmpty) {
      return null;
    }

    final citation = _firstCitationForTopRead(summary, item);
    return TopReadFeedbackTarget(
      providerKey: item.providerKey,
      interestId: interestId,
      title: item.title,
      feedItemId: citation?.feedItemId,
      sourceItemId: citation?.sourceItemId,
      bodyPreview: item.reason,
      canonicalUrl: item.canonicalUrl,
      citationIds: item.citationIds,
    );
  }

  SummaryCitation? _firstCitationForTopRead(
    ReaderSummary summary,
    TopRead item,
  ) {
    final citationById = {
      for (final citation in summary.citations) citation.id: citation,
    };
    for (final citationId in item.citationIds) {
      final citation = citationById[citationId];
      if (citation != null) {
        return citation;
      }
    }
    return null;
  }

  String _topPostRatingIdempotencyKey({
    required ReaderSummary summary,
    required TopReadFeedbackTarget target,
    required int rating,
  }) {
    final targetKey =
        target.feedItemId ??
        target.sourceItemId ??
        target.canonicalUrl ??
        target.title;
    return '${_scope.workspaceId}:${summary.id}:rate_post:$targetKey:$rating';
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
