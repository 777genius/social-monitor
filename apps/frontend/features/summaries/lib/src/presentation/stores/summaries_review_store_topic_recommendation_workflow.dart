part of 'summaries_review_store.dart';

extension SummariesReviewStoreTopicRecommendationWorkflow
    on SummariesReviewStore {
  Future<void> decideTopicRecommendation({
    required ReaderSummaryTopicRecommendation recommendation,
    required TopicRecommendationDecisionAction action,
  }) async {
    if (!_canDecideTopicRecommendation(recommendation, action)) {
      return;
    }

    final result = await _dependencies.decideTopicRecommendation(
      DecideTopicRecommendationCommand(
        scope: _scope,
        recommendationId: recommendation.id,
        topicLabel: recommendation.topicLabel,
        action: action,
        interestIds: recommendation.interestIds,
        providerKeys: recommendation.providerKeys,
      ),
    );

    result.fold(
      onSuccess: (status) {
        _rememberTopicRecommendationDecision(
          recommendationId: recommendation.id,
          status: status,
        );
        unawaited(loadTopicRecommendations());
      },
      onFailure: (_) {},
    );
  }

  Future<void> loadTopicRecommendations() async {
    final generation = _topicRecommendationGenerationGuard
        .markOperationStarted();
    final previous = switch (topicRecommendationState) {
      ReadyViewState<ReaderSummaryTopicRecommendationQueue>(:final value) =>
        value,
      LoadingViewState<ReaderSummaryTopicRecommendationQueue>(
        :final previousValue,
      ) =>
        previousValue,
      _ => null,
    };
    topicRecommendationState =
        LoadingViewState<ReaderSummaryTopicRecommendationQueue>(
          previousValue: previous,
        );
    _notifyStateChanged();

    final result = await _dependencies.loadTopicRecommendations(
      LoadTopicRecommendationsQuery(scope: _scope),
    );
    if (!_topicRecommendationGenerationGuard.isCurrent(generation)) {
      return;
    }

    topicRecommendationState = result.fold(
      onSuccess: (queue) => queue.isEmpty
          ? const EmptyViewState<ReaderSummaryTopicRecommendationQueue>(
              reason: 'summaries.topic_recommendations.empty',
            )
          : ReadyViewState<ReaderSummaryTopicRecommendationQueue>(queue),
      onFailure: (failure) =>
          FailureViewState<ReaderSummaryTopicRecommendationQueue>(
            failure: failure,
          ),
    );
    _notifyStateChanged();
  }

  void _rememberTopicRecommendationDecision({
    required String recommendationId,
    required ReaderSummaryTopicRecommendationDecisionStatus status,
  }) {
    final queue = _currentTopicRecommendationQueue();
    if (queue == null) {
      return;
    }

    topicRecommendationState =
        ReadyViewState<ReaderSummaryTopicRecommendationQueue>(
          ReaderSummaryTopicRecommendationQueue(
            windowStartedAt: queue.windowStartedAt,
            windowEndedAt: queue.windowEndedAt,
            items: queue.items
                .map(
                  (item) => item.id == recommendationId
                      ? _withTopicRecommendationDecision(item, status)
                      : item,
                )
                .toList(growable: false),
          ),
        );
    _notifyStateChanged();
  }

  ReaderSummaryTopicRecommendationQueue? _currentTopicRecommendationQueue() {
    return switch (topicRecommendationState) {
      ReadyViewState<ReaderSummaryTopicRecommendationQueue>(:final value) =>
        value,
      LoadingViewState<ReaderSummaryTopicRecommendationQueue>(
        :final previousValue,
      ) =>
        previousValue,
      _ => null,
    };
  }
}

ReaderSummaryTopicRecommendation _withTopicRecommendationDecision(
  ReaderSummaryTopicRecommendation item,
  ReaderSummaryTopicRecommendationDecisionStatus status,
) {
  final pending =
      status == ReaderSummaryTopicRecommendationDecisionStatus.pending;

  return ReaderSummaryTopicRecommendation(
    id: item.id,
    kind: item.kind,
    decisionStatus: status,
    decidedAt: pending ? null : DateTime.now().toUtc(),
    decidedBy: pending ? null : item.decidedBy,
    decisionNote: pending ? null : item.decisionNote,
    topicLabel: item.topicLabel,
    currentTier: item.currentTier,
    suggestedTier: item.suggestedTier,
    confidenceScore: item.confidenceScore,
    rationale: item.rationale,
    windowDays: item.windowDays,
    metrics: item.metrics,
    providerKeys: item.providerKeys,
    interestIds: item.interestIds,
    evidenceReaderSummaryIds: item.evidenceReaderSummaryIds,
    reasons: item.reasons,
  );
}

bool _canDecideTopicRecommendation(
  ReaderSummaryTopicRecommendation recommendation,
  TopicRecommendationDecisionAction action,
) {
  final isPending =
      recommendation.decisionStatus ==
      ReaderSummaryTopicRecommendationDecisionStatus.pending;

  return action == TopicRecommendationDecisionAction.undo
      ? !isPending
      : isPending;
}
