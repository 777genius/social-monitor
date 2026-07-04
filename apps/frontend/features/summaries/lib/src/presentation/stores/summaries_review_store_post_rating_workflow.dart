part of 'summaries_review_store.dart';

extension SummariesReviewStorePostRatingWorkflow on SummariesReviewStore {
  int? topPostRatingFor(ReaderSummary summary, TopRead item) {
    final target = _postRatingLookupTarget(_topPostRatingTarget(summary, item));
    if (target == null) {
      return null;
    }

    return _currentPostRatingByKey()[target.key]?.rating;
  }

  Future<void> _loadPostRatingsForSummary(ReaderSummary summary) async {
    final userId = _postRatingUserId(summary);
    if (userId == null || !_scope.isValid) {
      postRatingState = const InitialViewState<Map<String, PostRating>>();
      _notifyStateChanged();
      return;
    }

    final targetsByKey = <String, PostRatingLookupTarget>{};
    for (final item in _postRatingItems(summary)) {
      final target = _postRatingLookupTarget(
        _topPostRatingTarget(summary, item),
      );
      if (target != null) {
        targetsByKey[target.key] = target;
      }
    }

    if (targetsByKey.isEmpty) {
      postRatingState = const ReadyViewState<Map<String, PostRating>>({});
      _notifyStateChanged();
      return;
    }

    final generation = _postRatingGenerationGuard.markOperationStarted();
    final previous = _currentPostRatingByKey();
    postRatingState = LoadingViewState<Map<String, PostRating>>(
      previousValue: previous,
    );
    _notifyStateChanged();

    final result = await _dependencies.loadPostRatings(
      LoadPostRatingsQuery(
        scope: _scope,
        userId: userId,
        targets: targetsByKey.values.toList(growable: false),
      ),
    );
    if (!_postRatingGenerationGuard.isCurrent(generation)) {
      return;
    }

    postRatingState = result.fold(
      onSuccess: (ratings) => ReadyViewState<Map<String, PostRating>>({
        for (final rating in ratings) rating.key: rating,
      }),
      onFailure: (failure) =>
          FailureViewState<Map<String, PostRating>>(failure: failure),
    );
    _notifyStateChanged();
  }

  void _rememberSubmittedTopPostRating(PostRating rating) {
    postRatingState = ReadyViewState<Map<String, PostRating>>({
      ..._currentPostRatingByKey(),
      rating.key: rating,
    });
  }

  Map<String, PostRating> _currentPostRatingByKey() {
    return switch (postRatingState) {
      ReadyViewState<Map<String, PostRating>>(:final value) => value,
      LoadingViewState<Map<String, PostRating>>(:final previousValue) =>
        previousValue ?? const {},
      _ => const {},
    };
  }

  PostRatingLookupTarget? _postRatingLookupTarget(
    TopReadFeedbackTarget? target,
  ) {
    if (target == null || !target.hasPostIdentity) {
      return null;
    }
    final lookupTarget = PostRatingLookupTarget(
      feedItemId: target.feedItemId,
      sourceItemId: target.sourceItemId,
      interestId: target.interestId,
    );

    return lookupTarget.isValid ? lookupTarget : null;
  }

  String? _postRatingUserId(ReaderSummary summary) {
    final summaryUserId = summary.userId?.trim();
    if (summaryUserId != null && summaryUserId.isNotEmpty) {
      return summaryUserId;
    }

    final storeUserId = _userId.trim();
    return storeUserId.isEmpty ? null : storeUserId;
  }
}

List<TopRead> _postRatingItems(ReaderSummary summary) =>
    summary.content.selectedPosts.isNotEmpty
    ? summary.content.selectedPosts
    : summary.content.topReads;
