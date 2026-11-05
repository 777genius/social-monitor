import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/reader_source_launcher.dart';
import 'package:social_monitor_summaries/src/application/contracts/summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/application/queries/load_published_summary_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_workspace_summary_query.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_published_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_history_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/open_reader_source_use_case.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/stores/published_summary_store.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  test('publishes the explicit period before deferred history fails', () async {
    final summary = _dailySummary('summary-july-10', 2026, 7, 10);
    final history = Completer<Result<WorkspaceSummarySnapshot>>();
    final catalog = _PublishedSummaryCatalog(
      publishedResult: Future.value(
        Result.success(
          WorkspaceSummarySnapshot(
            current: summary,
            availablePeriods: [summary.period],
          ),
        ),
      ),
      historyResult: history.future,
    );
    final store = _store(catalog, summaryId: summary.id);
    addTearDown(store.dispose);
    final readyPeriods = <SummaryPeriod>[];
    store.addListener(() {
      if (store.state is ReadyViewState<ReaderSummary>) {
        readyPeriods.add(store.selectedPeriod);
      }
    });

    final load = store.load();
    await _waitUntil(() => catalog.historyQueries.isNotEmpty);

    expect(readyPeriods, isNotEmpty);
    expect(_samePeriod(readyPeriods.last, summary.period), isTrue);
    expect(_samePeriod(store.selectedPeriod, summary.period), isTrue);
    expect(store.isViewingLatestDailySummary, isFalse);

    history.complete(
      const Result.failure(
        UnexpectedFailure(
          message: 'History unavailable',
          code: 'summaries.history_unavailable',
        ),
      ),
    );
    await load;

    expect(_samePeriod(readyPeriods.last, summary.period), isTrue);
    expect(store.state, isA<ReadyViewState<ReaderSummary>>());
  });

  test(
    'previous and next load exact available periods without fallback',
    () async {
      final july8 = _dailySummary('summary-july-08', 2026, 7, 8);
      final july9 = _dailySummary('summary-july-09', 2026, 7, 9);
      final july10 = _dailySummary('summary-july-10', 2026, 7, 10);
      final periods = [july8.period, july9.period, july10.period];
      final catalog = _PublishedSummaryCatalog(
        publishedResult: Future.value(
          Result.success(
            WorkspaceSummarySnapshot(
              current: july10,
              availablePeriods: [july10.period],
            ),
          ),
        ),
        historyResult: Future.value(
          Result.success(WorkspaceSummarySnapshot(availablePeriods: periods)),
        ),
        periodSummaries: [july8, july9, july10],
      );
      final selectedSummaryIds = <String>[];
      final store = _store(
        catalog,
        summaryId: july10.id,
        onSummarySelected: selectedSummaryIds.add,
      );
      addTearDown(store.dispose);
      await store.load();

      expect(store.canNavigateToPreviousPeriod, isTrue);
      expect(store.canNavigateToNextPeriod, isFalse);

      await store.showPreviousPeriod();

      expect(catalog.workspaceQueries, hasLength(1));
      expect(catalog.workspaceQueries.single.allowLatestFallback, isFalse);
      expect(
        _samePeriod(catalog.workspaceQueries.single.period, july9.period),
        isTrue,
      );
      expect(_readySummary(store).id, july9.id);
      expect(selectedSummaryIds, [july9.id]);
      expect(store.canNavigateToNextPeriod, isTrue);

      await store.showNextPeriod();

      expect(catalog.workspaceQueries, hasLength(1));
      expect(catalog.publishedQueries, [july10.id]);
      expect(_readySummary(store).id, july10.id);
      expect(selectedSummaryIds, [july9.id, july10.id]);
    },
  );

  test('uses lightweight period references for adjacent summaries', () async {
    final july9 = _dailySummary('summary-july-09', 2026, 7, 9);
    final july10 = _dailySummary('summary-july-10', 2026, 7, 10);
    final catalog = _PublishedSummaryCatalog(
      publishedResult: Future.value(
        Result.success(WorkspaceSummarySnapshot(current: july10)),
      ),
      publishedSummaries: {july9.id: july9, july10.id: july10},
      historyResult: Future.value(
        Result.success(
          WorkspaceSummarySnapshot(
            availablePeriods: [july9.period, july10.period],
            availableSummaryReferences: [
              PublishedSummaryReference(
                summaryId: july9.id,
                period: july9.period,
              ),
              PublishedSummaryReference(
                summaryId: july10.id,
                period: july10.period,
              ),
            ],
          ),
        ),
      ),
    );
    final store = _store(catalog, summaryId: july10.id);
    addTearDown(store.dispose);
    await store.load();

    await store.showPreviousPeriod();

    expect(catalog.workspaceQueries, isEmpty);
    expect(catalog.publishedQueries, [july10.id, july9.id]);
    expect(_readySummary(store).id, july9.id);
  });

  test('falls back to the latest summary in the period catalog', () async {
    final july9 = _dailySummary('summary-july-09', 2026, 7, 9);
    final july10 = _dailySummary('summary-july-10', 2026, 7, 10);
    final references = [
      PublishedSummaryReference(summaryId: july9.id, period: july9.period),
      PublishedSummaryReference(summaryId: july10.id, period: july10.period),
    ];
    final catalog = _PublishedSummaryCatalog(
      publishedResult: Future.value(
        const Result.success(WorkspaceSummarySnapshot()),
      ),
      publishedSummaries: {july9.id: july9, july10.id: july10},
      historyResult: Future.value(
        Result.success(
          WorkspaceSummarySnapshot(
            availablePeriods: references
                .map((reference) => reference.period)
                .toList(growable: false),
            availableSummaryReferences: references,
            availablePeriodsAreComplete: true,
          ),
        ),
      ),
    );
    final store = _store(catalog);
    addTearDown(store.dispose);

    await store.load();

    expect(catalog.workspaceQueries, hasLength(1));
    expect(catalog.publishedQueries, [july10.id, july9.id]);
    expect(_readySummary(store).id, july10.id);
    expect(store.availablePeriods, hasLength(2));
  });

  test('refresh check does not reload an unchanged summary', () async {
    final july10 = _dailySummary('summary-july-10', 2026, 7, 10);
    final reference = PublishedSummaryReference(
      summaryId: july10.id,
      period: july10.period,
    );
    final history = Result.success(
      WorkspaceSummarySnapshot(
        availablePeriods: [july10.period],
        availableSummaryReferences: [reference],
        availablePeriodsAreComplete: true,
      ),
    );
    final catalog = _PublishedSummaryCatalog(
      publishedResult: Future.value(
        const Result.success(WorkspaceSummarySnapshot()),
      ),
      publishedSummaries: {july10.id: july10},
      historyResult: Future.value(history),
    );
    final store = _store(catalog);
    addTearDown(store.dispose);
    await store.load();

    await store.refreshIfNewer();

    expect(catalog.historyQueries, hasLength(2));
    expect(catalog.publishedQueries, [july10.id]);
    expect(_readySummary(store).id, july10.id);
  });

  test('refresh check loads a newly published summary once', () async {
    final july10 = _dailySummary('summary-july-10', 2026, 7, 10);
    final july11 = _dailySummary('summary-july-11', 2026, 7, 11);
    WorkspaceSummarySnapshot historyFor(ReaderSummary summary) {
      return WorkspaceSummarySnapshot(
        availablePeriods: [summary.period],
        availableSummaryReferences: [
          PublishedSummaryReference(
            summaryId: summary.id,
            period: summary.period,
          ),
        ],
        availablePeriodsAreComplete: true,
      );
    }

    final catalog = _PublishedSummaryCatalog(
      publishedResult: Future.value(
        const Result.success(WorkspaceSummarySnapshot()),
      ),
      publishedSummaries: {july10.id: july10, july11.id: july11},
      historyResult: Future.value(Result.success(historyFor(july11))),
      historyResults: [
        Future.value(Result.success(historyFor(july10))),
        Future.value(Result.success(historyFor(july11))),
      ],
    );
    final store = _store(catalog);
    addTearDown(store.dispose);
    await store.load();

    await store.refreshIfNewer();

    expect(catalog.historyQueries, hasLength(2));
    expect(catalog.publishedQueries, [july10.id, july11.id]);
    expect(_readySummary(store).id, july11.id);
  });

  test('keeps the article visible while referenced detail loads', () async {
    final july9 = _dailySummary('summary-july-09', 2026, 7, 9);
    final july10 = _dailySummary('summary-july-10', 2026, 7, 10);
    final deferredJuly9 = Completer<Result<WorkspaceSummarySnapshot>>();
    final references = [
      PublishedSummaryReference(summaryId: july9.id, period: july9.period),
      PublishedSummaryReference(summaryId: july10.id, period: july10.period),
    ];
    final catalog = _PublishedSummaryCatalog(
      publishedResult: Future.value(
        Result.success(WorkspaceSummarySnapshot(current: july10)),
      ),
      publishedResults: {july9.id: deferredJuly9.future},
      historyResult: Future.value(
        Result.success(
          WorkspaceSummarySnapshot(
            availablePeriods: references
                .map((reference) => reference.period)
                .toList(growable: false),
            availableSummaryReferences: references,
          ),
        ),
      ),
    );
    final store = _store(catalog, summaryId: july10.id);
    addTearDown(store.dispose);
    await store.load();

    final navigation = store.showPreviousPeriod();
    await Future<void>.delayed(Duration.zero);

    final loading = store.state as LoadingViewState<ReaderSummary>;
    expect(loading.previousValue?.id, july10.id);

    deferredJuly9.complete(
      Result.success(WorkspaceSummarySnapshot(current: july9)),
    );
    await navigation;
    expect(_readySummary(store).id, july9.id);
  });

  test(
    'dispose prevents a deferred published result from becoming ready',
    () async {
      final summary = _dailySummary('summary-july-10', 2026, 7, 10);
      final published = Completer<Result<WorkspaceSummarySnapshot>>();
      final catalog = _PublishedSummaryCatalog(
        publishedResult: published.future,
        historyResult: Future.value(
          const Result.success(WorkspaceSummarySnapshot()),
        ),
      );
      final store = _store(catalog, summaryId: summary.id);

      final load = store.load();
      expect(store.state, isA<LoadingViewState<ReaderSummary>>());
      store.dispose();
      published.complete(
        Result.success(WorkspaceSummarySnapshot(current: summary)),
      );
      await load;

      expect(store.state, isA<LoadingViewState<ReaderSummary>>());
      expect(catalog.historyQueries, isEmpty);
    },
  );

  test(
    'keeps the current article when a preset has no published period',
    () async {
      final july10 = _dailySummary('summary-july-10', 2026, 7, 10);
      final catalog = _PublishedSummaryCatalog(
        publishedResult: Future.value(
          Result.success(
            WorkspaceSummarySnapshot(
              current: july10,
              availablePeriods: [july10.period],
            ),
          ),
        ),
        historyResult: Future.value(
          Result.success(
            WorkspaceSummarySnapshot(availablePeriods: [july10.period]),
          ),
        ),
      );
      final store = _store(catalog, summaryId: july10.id);
      addTearDown(store.dispose);
      await store.load();

      await store.selectPeriodPreset(SummaryPeriodPreset.weekly);

      expect(store.selectedPeriodPreset, SummaryPeriodPreset.daily);
      expect(_readySummary(store).id, july10.id);
      expect(catalog.workspaceQueries, isEmpty);
    },
  );
}

PublishedSummaryStore _store(
  _PublishedSummaryCatalog catalog, {
  String? summaryId,
  void Function(String summaryId)? onSummarySelected,
}) {
  return PublishedSummaryStore(
    scope: summaryWorkspaceScope,
    loadLatest: LoadWorkspaceSummaryUseCase(catalog),
    loadHistory: LoadWorkspaceSummaryHistoryUseCase(catalog),
    loadPublished: LoadPublishedSummaryUseCase(catalog),
    openReaderSource: const OpenReaderSourceUseCase(_SourceLauncher()),
    summaryId: summaryId,
    onSummarySelected: onSummarySelected,
  );
}

ReaderSummary _dailySummary(String id, int year, int month, int day) {
  final startedAt = DateTime.utc(year, month, day);
  final endedAt = startedAt.add(const Duration(days: 1));
  return const SummaryMapper().readerSummaryToDomain(
    readerSummaryApiDto(
      id: id,
      period: summaryPeriodApiDto(
        startedAt: startedAt,
        endedAt: endedAt,
        periodKey: null,
      ),
    ),
  );
}

ReaderSummary _readySummary(PublishedSummaryStore store) {
  return (store.state as ReadyViewState<ReaderSummary>).value;
}

bool _samePeriod(SummaryPeriod left, SummaryPeriod right) {
  return left.cadence == right.cadence &&
      left.startedAt.toUtc() == right.startedAt.toUtc() &&
      left.endedAt.toUtc() == right.endedAt.toUtc() &&
      left.timezone == right.timezone;
}

Future<void> _waitUntil(bool Function() predicate) async {
  for (var attempt = 0; attempt < 20 && !predicate(); attempt += 1) {
    await Future<void>.delayed(Duration.zero);
  }
  expect(
    predicate(),
    isTrue,
    reason: 'Expected asynchronous call did not start',
  );
}

final class _PublishedSummaryCatalog extends Fake
    implements SummaryReviewCatalog {
  _PublishedSummaryCatalog({
    required this.publishedResult,
    required this.historyResult,
    this.historyResults = const [],
    this.periodSummaries = const [],
    this.publishedSummaries = const {},
    this.publishedResults = const {},
  });

  final Future<Result<WorkspaceSummarySnapshot>> publishedResult;
  final Future<Result<WorkspaceSummarySnapshot>> historyResult;
  final List<Future<Result<WorkspaceSummarySnapshot>>> historyResults;
  final List<ReaderSummary> periodSummaries;
  final Map<String, ReaderSummary> publishedSummaries;
  final Map<String, Future<Result<WorkspaceSummarySnapshot>>> publishedResults;
  final List<String> publishedQueries = [];
  final List<LoadWorkspaceSummaryQuery> workspaceQueries = [];
  final List<LoadWorkspaceSummaryQuery> historyQueries = [];

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadPublishedSummary(
    LoadPublishedSummaryQuery query,
  ) {
    publishedQueries.add(query.summaryId);
    final deferred = publishedResults[query.summaryId];
    if (deferred != null) {
      return deferred;
    }
    final summary = publishedSummaries[query.summaryId];
    return summary == null
        ? publishedResult
        : Future.value(
            Result.success(WorkspaceSummarySnapshot(current: summary)),
          );
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummaryHistory(
    LoadWorkspaceSummaryQuery query,
  ) {
    historyQueries.add(query);
    final index = historyQueries.length - 1;
    return index < historyResults.length
        ? historyResults[index]
        : historyResult;
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummary(
    LoadWorkspaceSummaryQuery query,
  ) async {
    workspaceQueries.add(query);
    ReaderSummary? match;
    for (final summary in periodSummaries) {
      if (_samePeriod(summary.period, query.period)) {
        match = summary;
        break;
      }
    }
    return Result.success(
      WorkspaceSummarySnapshot(
        current: match,
        availablePeriods: periodSummaries
            .map((summary) => summary.period)
            .toList(growable: false),
      ),
    );
  }
}

final class _SourceLauncher implements ReaderSourceLauncher {
  const _SourceLauncher();

  @override
  Future<Result<Unit>> open(Uri uri) async => const Result.success(Unit.value);
}
