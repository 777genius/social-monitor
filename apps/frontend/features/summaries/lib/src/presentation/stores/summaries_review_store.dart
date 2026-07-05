import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/decide_topic_recommendation_command.dart';
import '../../application/commands/open_reader_source_command.dart';
import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/request_workspace_summary_command.dart';
import '../../application/commands/submit_post_rating_command.dart';
import '../../application/commands/submit_reader_action_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_post_ratings_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
import '../../application/queries/load_topic_recommendations_query.dart';
import '../../application/queries/load_workspace_summary_job_status_query.dart';
import '../../application/queries/load_workspace_summary_query.dart';
import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/generated_summary.dart';
import '../../domain/entities/post_rating.dart';
import '../../domain/entities/reader_summary_job_snapshot.dart';
import '../../domain/entities/reader_summary_topic_recommendation.dart';
import '../../domain/entities/summary_citation.dart';
import '../../domain/value_objects/reader_action_target.dart';
import '../../domain/value_objects/summary_feedback_kind.dart';
import '../../domain/value_objects/summary_generation_status.dart';
import '../../domain/value_objects/summary_id.dart';
import '../../domain/value_objects/top_read_feedback_target.dart';
import '../workflows/summaries_review_store_dependencies.dart';

part 'summaries_review_store_workspace_summary_workflow.dart';
part 'summaries_review_store_post_rating_workflow.dart';
part 'summaries_review_store_reader_action_workflow.dart';
part 'summaries_review_store_topic_recommendation_workflow.dart';
part 'summaries_review_store_summary_workflow.dart';
part 'summaries_review_store_period_helpers.dart';

typedef SummaryRequestIdempotencyKeyFactory =
    String Function(WorkspaceScope scope, SummaryPeriod period);

final class SummariesReviewStore extends ChangeNotifier {
  SummariesReviewStore({
    required SummariesReviewStoreDependencies dependencies,
    required WorkspaceScope scope,
    required String userId,
    SummaryRequestIdempotencyKeyFactory? summaryRequestIdempotencyKeyFactory,
    Duration summaryPollInterval = const Duration(seconds: 2),
    int summaryPollAttempts = 12,
    OperationGenerationGuard? listGenerationGuard,
    OperationGenerationGuard? summaryGenerationGuard,
    OperationGenerationGuard? detailGenerationGuard,
    OperationGenerationGuard? mutationGenerationGuard,
    OperationGenerationGuard? readerActionGenerationGuard,
    OperationGenerationGuard? postRatingGenerationGuard,
    OperationGenerationGuard? topicRecommendationGenerationGuard,
    Duration workspaceSummaryLoadTimeout = const Duration(seconds: 20),
    ReaderActionTargetResolver readerActionTargetResolver =
        const ReaderActionTargetResolver(),
  }) : _dependencies = dependencies,
       _scope = scope,
       _userId = userId,
       _summaryRequestIdempotencyKeyFactory =
           summaryRequestIdempotencyKeyFactory ??
           _defaultSummaryRequestIdempotencyKey,
       _summaryPollInterval = summaryPollInterval,
       _summaryPollAttempts = summaryPollAttempts,
       _listGenerationGuard = listGenerationGuard ?? OperationGenerationGuard(),
       _summaryGenerationGuard =
           summaryGenerationGuard ?? OperationGenerationGuard(),
       _detailGenerationGuard =
           detailGenerationGuard ?? OperationGenerationGuard(),
       _mutationGenerationGuard =
           mutationGenerationGuard ?? OperationGenerationGuard(),
       _readerActionGenerationGuard =
           readerActionGenerationGuard ?? OperationGenerationGuard(),
       _postRatingGenerationGuard =
           postRatingGenerationGuard ?? OperationGenerationGuard(),
       _topicRecommendationGenerationGuard =
           topicRecommendationGenerationGuard ?? OperationGenerationGuard(),
       _workspaceSummaryLoadTimeout = workspaceSummaryLoadTimeout,
       _readerActionTargetResolver = readerActionTargetResolver;

  final SummariesReviewStoreDependencies _dependencies;
  final SummaryRequestIdempotencyKeyFactory
  _summaryRequestIdempotencyKeyFactory;
  final ReaderActionTargetResolver _readerActionTargetResolver;
  final Duration _summaryPollInterval;
  final int _summaryPollAttempts;
  final OperationGenerationGuard _listGenerationGuard;
  final OperationGenerationGuard _summaryGenerationGuard;
  final OperationGenerationGuard _detailGenerationGuard;
  final OperationGenerationGuard _mutationGenerationGuard;
  final OperationGenerationGuard _readerActionGenerationGuard;
  final OperationGenerationGuard _postRatingGenerationGuard;
  final OperationGenerationGuard _topicRecommendationGenerationGuard;
  final Duration _workspaceSummaryLoadTimeout;

  WorkspaceScope _scope;
  final String _userId;
  SummaryId? _selectedSummaryId;
  String? _activeReaderActionIdempotencyKey;
  String? _lastReaderActionIdempotencyKey;
  Future<void>? _activeWorkspaceSummaryLoad;
  String? _activeWorkspaceSummaryLoadKey;
  bool _isDisposed = false;
  SummaryPeriodPreset selectedSummaryPeriodPreset = SummaryPeriodPreset.daily;
  DateTime? _selectedSummaryPeriodEndedAt;

  AsyncViewState<PageResult<GeneratedSummary>> listState =
      const InitialViewState<PageResult<GeneratedSummary>>();
  AsyncViewState<WorkspaceSummarySnapshot> workspaceSummaryState =
      const InitialViewState<WorkspaceSummarySnapshot>();
  AsyncViewState<ReaderSummaryJobSnapshot> summaryJobState =
      const InitialViewState<ReaderSummaryJobSnapshot>();
  AsyncViewState<GeneratedSummary> detailState =
      const InitialViewState<GeneratedSummary>();
  AsyncViewState<GeneratedSummary> regenerationState =
      const InitialViewState<GeneratedSummary>();
  AsyncViewState<GeneratedSummary> feedbackState =
      const InitialViewState<GeneratedSummary>();
  AsyncViewState<ReaderActionResult> readerActionState =
      const InitialViewState<ReaderActionResult>();
  AsyncViewState<Map<String, PostRating>> postRatingState =
      const InitialViewState<Map<String, PostRating>>();
  AsyncViewState<ReaderSummaryTopicRecommendationQueue>
  topicRecommendationState =
      const InitialViewState<ReaderSummaryTopicRecommendationQueue>();

  WorkspaceScope get scope => _scope;

  SummaryPeriod get selectedSummaryPeriod {
    return selectedSummaryPeriodPreset.resolve(
      periodEndedAt: _selectedSummaryPeriodEndedAt,
    );
  }

  bool get isSelectedSummaryPeriodCurrent {
    final latestAvailable = _latestAvailableSummaryPeriodForSelectedPreset;
    if (latestAvailable != null) {
      return _sameSummaryPeriodWindow(selectedSummaryPeriod, latestAvailable);
    }
    return selectedSummaryPeriod.endedAt ==
        selectedSummaryPeriodPreset.currentPeriodEndedAt();
  }

  bool get canShowPreviousSummaryPeriod {
    if (availableWorkspaceSummaryPeriods.isNotEmpty) {
      return _previousAvailableSummaryPeriodForSelectedPreset != null;
    }
    return false;
  }

  bool get canShowNextSummaryPeriod {
    if (availableWorkspaceSummaryPeriods.isNotEmpty) {
      return _nextAvailableSummaryPeriodForSelectedPreset != null;
    }
    return selectedSummaryPeriodPreset.canNavigateNext(
      selectedSummaryPeriod.endedAt,
    );
  }

  List<SummaryPeriod> get availableWorkspaceSummaryPeriods {
    final periodsByKey = <String, SummaryPeriod>{};
    void addPeriod(SummaryPeriod period) {
      periodsByKey[_summaryPeriodAvailabilityKey(period)] = period;
    }

    void addSnapshot(WorkspaceSummarySnapshot snapshot) {
      for (final period in snapshot.availablePeriods) {
        addPeriod(period);
      }
      final current = snapshot.current;
      if (current != null) {
        addPeriod(current.period);
      }
    }

    switch (workspaceSummaryState) {
      case ReadyViewState<WorkspaceSummarySnapshot>(:final value):
        addSnapshot(value);
      case LoadingViewState<WorkspaceSummarySnapshot>(:final previousValue)
          when previousValue != null:
        addSnapshot(previousValue);
      default:
        break;
    }

    return periodsByKey.values.toList(growable: false);
  }

  SummaryPeriod? get _previousAvailableSummaryPeriodForSelectedPreset {
    return _nearestAvailableSummaryPeriodForSelectedPreset(
      isBeforeSelectedPeriod: true,
    );
  }

  SummaryPeriod? get _nextAvailableSummaryPeriodForSelectedPreset {
    return _nearestAvailableSummaryPeriodForSelectedPreset(
      isBeforeSelectedPeriod: false,
    );
  }

  SummaryPeriod? get _latestAvailableSummaryPeriodForSelectedPreset {
    final periods = _availableSummaryPeriodsForSelectedPreset();
    if (periods.isEmpty) {
      return null;
    }
    periods.sort((left, right) => left.endedAt.compareTo(right.endedAt));
    return periods.last;
  }

  SummaryPeriod? _nearestAvailableSummaryPeriodForSelectedPreset({
    required bool isBeforeSelectedPeriod,
  }) {
    final selectedEndedAt = selectedSummaryPeriod.endedAt.toUtc();
    final periods = _availableSummaryPeriodsForSelectedPreset()
        .where(
          (period) => isBeforeSelectedPeriod
              ? period.endedAt.toUtc().isBefore(selectedEndedAt)
              : period.endedAt.toUtc().isAfter(selectedEndedAt),
        )
        .toList(growable: false);
    if (periods.isEmpty) {
      return null;
    }
    periods.sort((left, right) => left.endedAt.compareTo(right.endedAt));
    return isBeforeSelectedPeriod ? periods.last : periods.first;
  }

  List<SummaryPeriod> _availableSummaryPeriodsForSelectedPreset() {
    return availableWorkspaceSummaryPeriods
        .where(
          (period) => _periodMatchesPreset(period, selectedSummaryPeriodPreset),
        )
        .toList(growable: false);
  }

  String? get activeReaderActionIdempotencyKey =>
      _activeReaderActionIdempotencyKey;

  String? get lastReaderActionIdempotencyKey => _lastReaderActionIdempotencyKey;

  bool get hasExplicitSelection => _selectedSummaryId != null;

  GeneratedSummary? get selectedSummary {
    final detail = detailState;
    final selectedId = _selectedSummaryId;
    if (detail is ReadyViewState<GeneratedSummary> &&
        (selectedId == null || detail.value.id == selectedId)) {
      return detail.value;
    }

    final list = listState;
    if (list is! ReadyViewState<PageResult<GeneratedSummary>>) {
      return null;
    }
    for (final summary in list.value.items) {
      if (summary.id == selectedId) {
        return summary;
      }
    }
    return list.value.items.firstOrNull;
  }

  void _notifyStateChanged() {
    if (_isDisposed) {
      return;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _isDisposed = true;
    _listGenerationGuard.invalidate();
    _summaryGenerationGuard.invalidate();
    _detailGenerationGuard.invalidate();
    _mutationGenerationGuard.invalidate();
    _readerActionGenerationGuard.invalidate();
    _postRatingGenerationGuard.invalidate();
    _topicRecommendationGenerationGuard.invalidate();
    _activeWorkspaceSummaryLoad = null;
    _activeWorkspaceSummaryLoadKey = null;
    super.dispose();
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _listGenerationGuard.invalidate();
    _summaryGenerationGuard.invalidate();
    _detailGenerationGuard.invalidate();
    _mutationGenerationGuard.invalidate();
    _readerActionGenerationGuard.invalidate();
    _postRatingGenerationGuard.invalidate();
    _topicRecommendationGenerationGuard.invalidate();
    _selectedSummaryId = null;
    listState = const InitialViewState<PageResult<GeneratedSummary>>();
    workspaceSummaryState = const InitialViewState<WorkspaceSummarySnapshot>();
    summaryJobState = const InitialViewState<ReaderSummaryJobSnapshot>();
    detailState = const InitialViewState<GeneratedSummary>();
    regenerationState = const InitialViewState<GeneratedSummary>();
    feedbackState = const InitialViewState<GeneratedSummary>();
    readerActionState = const InitialViewState<ReaderActionResult>();
    postRatingState = const InitialViewState<Map<String, PostRating>>();
    topicRecommendationState =
        const InitialViewState<ReaderSummaryTopicRecommendationQueue>();
    _activeReaderActionIdempotencyKey = null;
    _lastReaderActionIdempotencyKey = null;
    _activeWorkspaceSummaryLoad = null;
    _activeWorkspaceSummaryLoadKey = null;
    _notifyStateChanged();
  }

  Future<void> load() async {
    unawaited(loadWorkspaceSummary());
    unawaited(loadTopicRecommendations());

    final generation = _listGenerationGuard.markOperationStarted();
    final previous = switch (listState) {
      ReadyViewState<PageResult<GeneratedSummary>>(:final value) => value,
      LoadingViewState<PageResult<GeneratedSummary>>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    listState = LoadingViewState<PageResult<GeneratedSummary>>(
      previousValue: previous,
    );
    _notifyStateChanged();

    final result = await _dependencies.listSummaries(
      ListSummariesQuery(scope: _scope),
    );
    if (!_listGenerationGuard.isCurrent(generation)) {
      return;
    }

    listState = result.fold(
      onSuccess: (page) {
        if (page.items.isEmpty) {
          _selectedSummaryId = null;
          detailState = const InitialViewState<GeneratedSummary>();
          return const EmptyViewState<PageResult<GeneratedSummary>>(
            reason: 'summaries.empty',
          );
        }
        _clearSelectionIfMissing(page.items);
        return ReadyViewState<PageResult<GeneratedSummary>>(
          PageResult<GeneratedSummary>(
            items: page.items,
            request: page.request,
            nextCursor: page.nextCursor,
            isPartial: page.isPartial,
          ),
        );
      },
      onFailure: (failure) =>
          FailureViewState<PageResult<GeneratedSummary>>(failure: failure),
    );
    _notifyStateChanged();
  }

  Future<void> loadWorkspaceSummary() async {
    final loadKey = _workspaceSummaryLoadKey(_scope, selectedSummaryPeriod);
    final activeLoad = _activeWorkspaceSummaryLoad;
    if (activeLoad != null && _activeWorkspaceSummaryLoadKey == loadKey) {
      await activeLoad;
      return;
    }

    final generation = _summaryGenerationGuard.markOperationStarted();
    final load = _loadWorkspaceSummaryForStore(this, generation);
    _activeWorkspaceSummaryLoad = load;
    _activeWorkspaceSummaryLoadKey = loadKey;
    try {
      await load;
    } finally {
      if (_activeWorkspaceSummaryLoadKey == loadKey) {
        _activeWorkspaceSummaryLoad = null;
        _activeWorkspaceSummaryLoadKey = null;
      }
    }
  }

  void _clearSelectionIfMissing(List<GeneratedSummary> items) {
    final selectedId = _selectedSummaryId;
    if (selectedId == null) {
      return;
    }
    final exists = items.any((summary) => summary.id == selectedId);
    if (!exists) {
      _selectedSummaryId = null;
      detailState = const InitialViewState<GeneratedSummary>();
    }
  }
}
