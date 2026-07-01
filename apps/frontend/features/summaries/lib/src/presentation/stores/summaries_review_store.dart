import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/open_reader_source_command.dart';
import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/request_workspace_summary_command.dart';
import '../../application/commands/submit_reader_action_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
import '../../application/queries/load_workspace_summary_job_status_query.dart';
import '../../application/queries/load_workspace_summary_query.dart';
import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/generated_summary.dart';
import '../../domain/entities/reader_summary_job_snapshot.dart';
import '../../domain/value_objects/reader_action_target.dart';
import '../../domain/value_objects/summary_feedback_kind.dart';
import '../../domain/value_objects/summary_generation_status.dart';
import '../../domain/value_objects/summary_id.dart';
import '../workflows/summaries_review_store_dependencies.dart';

part 'summaries_review_store_workspace_summary_workflow.dart';
part 'summaries_review_store_reader_action_workflow.dart';
part 'summaries_review_store_summary_workflow.dart';

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
  final Duration _workspaceSummaryLoadTimeout;

  WorkspaceScope _scope;
  final String _userId;
  SummaryId? _selectedSummaryId;
  String? _activeReaderActionIdempotencyKey;
  String? _lastReaderActionIdempotencyKey;
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
    _selectedSummaryId = null;
    listState = const InitialViewState<PageResult<GeneratedSummary>>();
    workspaceSummaryState = const InitialViewState<WorkspaceSummarySnapshot>();
    summaryJobState = const InitialViewState<ReaderSummaryJobSnapshot>();
    detailState = const InitialViewState<GeneratedSummary>();
    regenerationState = const InitialViewState<GeneratedSummary>();
    feedbackState = const InitialViewState<GeneratedSummary>();
    readerActionState = const InitialViewState<ReaderActionResult>();
    _activeReaderActionIdempotencyKey = null;
    _lastReaderActionIdempotencyKey = null;
    _notifyStateChanged();
  }

  Future<void> load() async {
    unawaited(loadWorkspaceSummary());

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
    final generation = _summaryGenerationGuard.markOperationStarted();
    await _loadWorkspaceSummaryForStore(this, generation);
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

String _summaryPeriodAvailabilityKey(SummaryPeriod period) {
  return [
    period.cadence.name,
    period.startedAt.toUtc().toIso8601String(),
    period.endedAt.toUtc().toIso8601String(),
    period.timezone,
  ].join('|');
}

List<SummaryPeriod> _snapshotSummaryPeriods(WorkspaceSummarySnapshot snapshot) {
  final periodsByKey = <String, SummaryPeriod>{};
  void add(SummaryPeriod period) {
    periodsByKey[_summaryPeriodAvailabilityKey(period)] = period;
  }

  for (final period in snapshot.availablePeriods) {
    add(period);
  }
  final current = snapshot.current;
  if (current != null) {
    add(current.period);
  }

  return periodsByKey.values.toList(growable: false);
}

bool _sameSummaryPeriodWindow(SummaryPeriod left, SummaryPeriod right) {
  return left.cadence == right.cadence &&
      left.startedAt.toUtc() == right.startedAt.toUtc() &&
      left.endedAt.toUtc() == right.endedAt.toUtc() &&
      left.timezone == right.timezone;
}

bool _periodMatchesPreset(SummaryPeriod period, SummaryPeriodPreset preset) {
  return switch (preset) {
    SummaryPeriodPreset.daily =>
      period.cadence == SummaryPeriodCadence.daily &&
          _periodDurationDays(period) == 1,
    SummaryPeriodPreset.weekly =>
      period.cadence == SummaryPeriodCadence.weekly &&
          _periodDurationDays(period) == 7,
    SummaryPeriodPreset.twoWeeks =>
      period.cadence == SummaryPeriodCadence.custom &&
          _periodDurationDays(period) == 14,
    SummaryPeriodPreset.threeWeeks =>
      period.cadence == SummaryPeriodCadence.custom &&
          _periodDurationDays(period) == 21,
    SummaryPeriodPreset.monthly =>
      period.cadence == SummaryPeriodCadence.monthly,
  };
}

int _periodDurationDays(SummaryPeriod period) {
  return period.endedAt.toUtc().difference(period.startedAt.toUtc()).inDays;
}
