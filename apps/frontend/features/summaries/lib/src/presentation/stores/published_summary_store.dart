import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/open_reader_source_command.dart';
import '../../application/queries/load_published_summary_query.dart';
import '../../application/queries/load_workspace_summary_query.dart';
import '../../application/use_cases/load_published_summary_use_case.dart';
import '../../application/use_cases/load_workspace_summary_history_use_case.dart';
import '../../application/use_cases/load_workspace_summary_use_case.dart';
import '../../application/use_cases/open_reader_source_use_case.dart';
import '../../domain/aggregates/reader_summary.dart';
import '../workflows/summary_period_navigation.dart';

part '../workflows/published_summary_refresh_workflow.dart';

final class PublishedSummaryStore extends ChangeNotifier {
  PublishedSummaryStore({
    required WorkspaceScope scope,
    required LoadWorkspaceSummaryUseCase loadLatest,
    required LoadWorkspaceSummaryHistoryUseCase loadHistory,
    required LoadPublishedSummaryUseCase loadPublished,
    required OpenReaderSourceUseCase openReaderSource,
    this.summaryId,
    void Function(String summaryId)? onSummarySelected,
    OperationGenerationGuard? generationGuard,
    OperationGenerationGuard? historyGenerationGuard,
  }) : _scope = scope,
       _loadLatest = loadLatest,
       _loadHistory = loadHistory,
       _loadPublished = loadPublished,
       _openReaderSource = openReaderSource,
       _onSummarySelected = onSummarySelected,
       _generationGuard = generationGuard ?? OperationGenerationGuard(),
       _historyGenerationGuard =
           historyGenerationGuard ?? OperationGenerationGuard();

  final WorkspaceScope _scope;
  final LoadWorkspaceSummaryUseCase _loadLatest;
  final LoadWorkspaceSummaryHistoryUseCase _loadHistory;
  final LoadPublishedSummaryUseCase _loadPublished;
  final OpenReaderSourceUseCase _openReaderSource;
  final void Function(String summaryId)? _onSummarySelected;
  final OperationGenerationGuard _generationGuard;
  final OperationGenerationGuard _historyGenerationGuard;
  final String? summaryId;

  AsyncViewState<ReaderSummary> state = const InitialViewState<ReaderSummary>();
  SummaryPeriodPreset selectedPeriodPreset = SummaryPeriodPreset.daily;
  List<SummaryPeriod> availablePeriods = const [];
  List<PublishedSummaryReference> availableSummaryReferences = const [];
  DateTime? _selectedPeriodEndedAt;

  SummaryPeriod get selectedPeriod =>
      selectedPeriodPreset.resolve(periodEndedAt: _selectedPeriodEndedAt);

  List<SummaryPeriod> get availablePeriodsForPreset =>
      availablePeriods
          .where(
            (period) =>
                summaryPeriodMatchesPreset(period, selectedPeriodPreset),
          )
          .toList(growable: false)
        ..sort((left, right) => left.endedAt.compareTo(right.endedAt));

  bool get canNavigateToPreviousPeriod => _adjacentAvailablePeriod(-1) != null;

  bool get canNavigateToNextPeriod => _adjacentAvailablePeriod(1) != null;

  bool get isCurrentPeriod {
    final periods = availablePeriodsForPreset;
    return periods.isEmpty ||
        sameSummaryPeriodWindow(selectedPeriod, periods.last);
  }

  bool get isViewingLatestDailySummary {
    final requestedId = summaryId?.trim();
    return (requestedId == null || requestedId.isEmpty) &&
        selectedPeriodPreset == SummaryPeriodPreset.daily &&
        isCurrentPeriod;
  }

  Future<void> load() async {
    final generation = _generationGuard.markOperationStarted();
    final previous = switch (state) {
      ReadyViewState<ReaderSummary>(:final value) => value,
      LoadingViewState<ReaderSummary>(:final previousValue) => previousValue,
      _ => null,
    };
    state = LoadingViewState<ReaderSummary>(previousValue: previous);
    notifyListeners();

    final requestedId = summaryId?.trim();
    WorkspaceSummarySnapshot? preloadedHistory;
    Result<WorkspaceSummarySnapshot> result;
    if (requestedId != null && requestedId.isNotEmpty) {
      result = await _loadPublished(
        LoadPublishedSummaryQuery(scope: _scope, summaryId: requestedId),
      );
    } else {
      final historyResult = await _loadHistory(
        LoadWorkspaceSummaryQuery(
          scope: _scope,
          period: SummaryPeriodPreset.daily.resolve(),
        ),
      );
      if (!_generationGuard.isCurrent(generation)) {
        return;
      }
      preloadedHistory = historyResult.fold(
        onSuccess: (snapshot) => snapshot,
        onFailure: (_) => null,
      );
      final latest = _latestReference(
        preloadedHistory?.availableSummaryReferences ?? const [],
        SummaryPeriodPreset.daily,
      );
      result = latest == null
          ? await _loadLatest(
              LoadWorkspaceSummaryQuery(
                scope: _scope,
                period: SummaryPeriodPreset.daily.resolve(),
              ),
            )
          : await _loadPublished(
              LoadPublishedSummaryQuery(
                scope: _scope,
                summaryId: latest.summaryId,
              ),
            );
    }
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }
    WorkspaceSummarySnapshot? loadedSnapshot;
    state = result.fold(
      onSuccess: (snapshot) {
        loadedSnapshot = snapshot;
        final summary = snapshot.current;
        if (summary != null) {
          _selectPeriod(summary.period);
          availablePeriods = mergeSummaryPeriods(
            preloadedHistory?.availablePeriods ?? const [],
            [...snapshot.availablePeriods, summary.period],
          );
          availableSummaryReferences = mergePublishedSummaryReferences(
            preloadedHistory?.availableSummaryReferences ?? const [],
            [
              ...snapshot.availableSummaryReferences,
              PublishedSummaryReference(
                summaryId: summary.id,
                period: summary.period,
              ),
            ],
          );
        }
        return summary == null
            ? const EmptyViewState<ReaderSummary>(
                reason: 'No published daily summary is available yet.',
              )
            : ReadyViewState<ReaderSummary>(
                summary,
                isDegraded: summary.isDegraded,
              );
      },
      onFailure: (failure) => FailureViewState<ReaderSummary>(failure: failure),
    );
    notifyListeners();
    final snapshot = loadedSnapshot;
    final current = snapshot?.current;
    if (current != null &&
        preloadedHistory?.availablePeriodsAreComplete != true) {
      await _refreshAvailablePeriods();
    }
  }

  Future<void> selectPeriodPreset(SummaryPeriodPreset preset) async {
    if (preset == selectedPeriodPreset) {
      return;
    }
    final previousPreset = selectedPeriodPreset;
    final previousPeriodEndedAt = _selectedPeriodEndedAt;
    selectedPeriodPreset = preset;
    _selectedPeriodEndedAt = null;
    notifyListeners();
    await _refreshAvailablePeriods();
    final periods = availablePeriodsForPreset;
    if (periods.isEmpty) {
      selectedPeriodPreset = previousPreset;
      _selectedPeriodEndedAt = previousPeriodEndedAt;
      notifyListeners();
      return;
    }
    _selectedPeriodEndedAt = periods.last.endedAt;
    await _loadSelectedPeriod();
  }

  Future<void> showPreviousPeriod() => _showAdjacentPeriod(-1);

  Future<void> showNextPeriod() => _showAdjacentPeriod(1);

  Future<void> showCurrentPeriod() async {
    final periods = availablePeriodsForPreset;
    if (periods.isEmpty) {
      return;
    }
    _selectedPeriodEndedAt = periods.last.endedAt;
    await _loadSelectedPeriod();
  }

  Future<void> selectCalendarDate(DateTime date) async {
    final requested = selectedPeriodPreset.resolveForCalendarDate(date);
    final available = availablePeriodsForPreset.where(
      (period) => sameSummaryPeriodWindow(period, requested),
    );
    if (available.isEmpty) {
      return;
    }
    _selectedPeriodEndedAt = available.first.endedAt;
    await _loadSelectedPeriod();
  }

  Future<void> _showAdjacentPeriod(int offset) async {
    final adjacent = _adjacentAvailablePeriod(offset);
    if (adjacent == null) {
      return;
    }
    _selectedPeriodEndedAt = adjacent.endedAt;
    await _loadSelectedPeriod();
  }

  SummaryPeriod? _adjacentAvailablePeriod(int offset) {
    final periods = availablePeriodsForPreset;
    final index = periods.indexWhere(
      (period) => sameSummaryPeriodWindow(period, selectedPeriod),
    );
    final nextIndex = index + offset;
    return index < 0 || nextIndex < 0 || nextIndex >= periods.length
        ? null
        : periods[nextIndex];
  }

  Future<void> _loadSelectedPeriod() async {
    final generation = _generationGuard.markOperationStarted();
    final previous = switch (state) {
      ReadyViewState<ReaderSummary>(:final value) => value,
      LoadingViewState<ReaderSummary>(:final previousValue) => previousValue,
      _ => null,
    };
    state = LoadingViewState<ReaderSummary>(previousValue: previous);
    notifyListeners();
    final reference = _referenceForPeriod(selectedPeriod);
    final result = reference == null
        ? await _loadLatest(
            LoadWorkspaceSummaryQuery(
              scope: _scope,
              period: selectedPeriod,
              allowLatestFallback: false,
            ),
          )
        : await _loadPublished(
            LoadPublishedSummaryQuery(
              scope: _scope,
              summaryId: reference.summaryId,
            ),
          );
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }
    ReaderSummary? selectedSummary;
    state = result.fold(
      onSuccess: (snapshot) {
        final summary = snapshot.current;
        if (summary == null) {
          if (previous != null) {
            _selectPeriod(previous.period);
            return ReadyViewState<ReaderSummary>(
              previous,
              isDegraded: previous.isDegraded,
            );
          }
          return const EmptyViewState<ReaderSummary>(
            reason: 'No published summary exists for this period.',
          );
        }
        selectedSummary = summary;
        _selectPeriod(summary.period);
        availablePeriods = mergeSummaryPeriods(availablePeriods, [
          summary.period,
        ]);
        availableSummaryReferences = mergePublishedSummaryReferences(
          availableSummaryReferences,
          snapshot.availableSummaryReferences,
        );
        return ReadyViewState<ReaderSummary>(
          summary,
          isDegraded: summary.isDegraded,
        );
      },
      onFailure: (failure) {
        if (previous != null) {
          _selectPeriod(previous.period);
          return ReadyViewState<ReaderSummary>(
            previous,
            isDegraded: previous.isDegraded,
          );
        }
        return FailureViewState<ReaderSummary>(failure: failure);
      },
    );
    notifyListeners();
    final selected = selectedSummary;
    if (selected != null && selected.id != previous?.id) {
      _onSummarySelected?.call(selected.id);
    }
  }

  Future<void> _refreshAvailablePeriods() async {
    final generation = _historyGenerationGuard.markOperationStarted();
    final result = await _loadHistory(
      LoadWorkspaceSummaryQuery(scope: _scope, period: selectedPeriod),
    );
    if (!_historyGenerationGuard.isCurrent(generation)) {
      return;
    }
    result.fold(
      onSuccess: (snapshot) {
        availablePeriods = mergeSummaryPeriods(
          availablePeriods,
          snapshot.availablePeriods,
        );
        availableSummaryReferences = mergePublishedSummaryReferences(
          availableSummaryReferences,
          snapshot.availableSummaryReferences,
        );
        notifyListeners();
      },
      onFailure: (_) {},
    );
  }

  void _notifyChanged() => notifyListeners();

  void _selectPeriod(SummaryPeriod period) {
    selectedPeriodPreset = summaryPeriodPresetFor(period);
    _selectedPeriodEndedAt = period.endedAt;
  }

  PublishedSummaryReference? _referenceForPeriod(SummaryPeriod period) {
    for (final reference in availableSummaryReferences) {
      if (sameSummaryPeriodWindow(reference.period, period)) {
        return reference;
      }
    }
    return null;
  }

  PublishedSummaryReference? _latestReference(
    Iterable<PublishedSummaryReference> references,
    SummaryPeriodPreset preset,
  ) {
    final matches =
        references
            .where(
              (reference) =>
                  summaryPeriodMatchesPreset(reference.period, preset),
            )
            .toList(growable: false)
          ..sort(
            (left, right) =>
                left.period.endedAt.compareTo(right.period.endedAt),
          );
    return matches.isEmpty ? null : matches.last;
  }

  Future<void> openUrl(String canonicalUrl) async {
    final current = switch (state) {
      ReadyViewState<ReaderSummary>(:final value) => value,
      _ => null,
    };
    if (current == null) {
      return;
    }
    await _openReaderSource(
      OpenReaderSourceCommand(
        summaryId: current.id,
        kind: 'read_source',
        label: 'Open source',
        canonicalUrl: canonicalUrl,
        idempotencyKey: '${current.id}:public-source:${canonicalUrl.hashCode}',
      ),
    );
  }

  @override
  void dispose() {
    _generationGuard.invalidate();
    _historyGenerationGuard.invalidate();
    super.dispose();
  }
}
