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
  test('publishes latest while the period catalog is still loading', () async {
    final summary = _dailySummary('summary-july-10', 2026, 7, 10);
    final latest = Completer<Result<WorkspaceSummarySnapshot>>();
    final history = Completer<Result<WorkspaceSummarySnapshot>>();
    final catalog = _InitialLoadCatalog(
      latestResult: latest.future,
      historyResult: history.future,
    );
    final store = _store(catalog);
    addTearDown(store.dispose);

    final load = store.load();
    await _waitUntil(
      () =>
          catalog.latestQueries.isNotEmpty && catalog.historyQueries.isNotEmpty,
    );

    latest.complete(Result.success(WorkspaceSummarySnapshot(current: summary)));
    await _waitUntil(() => store.state is ReadyViewState<ReaderSummary>);

    expect(_readySummary(store).id, summary.id);
    expect(catalog.publishedQueries, isEmpty);

    history.complete(
      Result.success(
        WorkspaceSummarySnapshot(
          availablePeriods: [summary.period],
          availableSummaryReferences: [
            PublishedSummaryReference(
              summaryId: summary.id,
              period: summary.period,
            ),
          ],
          availablePeriodsAreComplete: true,
        ),
      ),
    );
    await load;

    expect(catalog.latestQueries, hasLength(1));
    expect(catalog.historyQueries, hasLength(1));
    expect(_readySummary(store).id, summary.id);
  });

  test(
    'falls back to the latest period reference when direct load fails',
    () async {
      final summary = _dailySummary('summary-july-10', 2026, 7, 10);
      final reference = PublishedSummaryReference(
        summaryId: summary.id,
        period: summary.period,
      );
      final catalog = _InitialLoadCatalog(
        latestResult: Future.value(
          const Result.failure(
            UnexpectedFailure(message: 'Latest endpoint unavailable'),
          ),
        ),
        historyResult: Future.value(
          Result.success(
            WorkspaceSummarySnapshot(
              availablePeriods: [summary.period],
              availableSummaryReferences: [reference],
              availablePeriodsAreComplete: true,
            ),
          ),
        ),
        publishedSummaries: {summary.id: summary},
      );
      final store = _store(catalog);
      addTearDown(store.dispose);

      await store.load();

      expect(catalog.latestQueries, hasLength(1));
      expect(catalog.historyQueries, hasLength(1));
      expect(catalog.publishedQueries, [summary.id]);
      expect(_readySummary(store).id, summary.id);
    },
  );

  test(
    'adopts a newer period discovered during parallel history load',
    () async {
      final previous = _dailySummary('summary-july-09', 2026, 7, 9);
      final current = _dailySummary('summary-july-10', 2026, 7, 10);
      final reference = PublishedSummaryReference(
        summaryId: current.id,
        period: current.period,
      );
      final catalog = _InitialLoadCatalog(
        latestResult: Future.value(
          Result.success(WorkspaceSummarySnapshot(current: previous)),
        ),
        historyResult: Future.value(
          Result.success(
            WorkspaceSummarySnapshot(
              availablePeriods: [previous.period, current.period],
              availableSummaryReferences: [reference],
              availablePeriodsAreComplete: true,
            ),
          ),
        ),
        publishedSummaries: {current.id: current},
      );
      final store = _store(catalog);
      addTearDown(store.dispose);

      await store.load();

      expect(catalog.publishedQueries, [current.id]);
      expect(_readySummary(store).id, current.id);
    },
  );
}

PublishedSummaryStore _store(_InitialLoadCatalog catalog) {
  return PublishedSummaryStore(
    scope: summaryWorkspaceScope,
    loadLatest: LoadWorkspaceSummaryUseCase(catalog),
    loadHistory: LoadWorkspaceSummaryHistoryUseCase(catalog),
    loadPublished: LoadPublishedSummaryUseCase(catalog),
    openReaderSource: const OpenReaderSourceUseCase(_SourceLauncher()),
  );
}

ReaderSummary _dailySummary(String id, int year, int month, int day) {
  final startedAt = DateTime.utc(year, month, day);
  return const SummaryMapper().readerSummaryToDomain(
    readerSummaryApiDto(
      id: id,
      period: summaryPeriodApiDto(
        startedAt: startedAt,
        endedAt: startedAt.add(const Duration(days: 1)),
        periodKey: null,
      ),
    ),
  );
}

ReaderSummary _readySummary(PublishedSummaryStore store) {
  return (store.state as ReadyViewState<ReaderSummary>).value;
}

Future<void> _waitUntil(bool Function() predicate) async {
  for (var attempt = 0; attempt < 20 && !predicate(); attempt += 1) {
    await Future<void>.delayed(Duration.zero);
  }
  expect(predicate(), isTrue, reason: 'Expected asynchronous state change');
}

final class _InitialLoadCatalog extends Fake implements SummaryReviewCatalog {
  _InitialLoadCatalog({
    required this.latestResult,
    required this.historyResult,
    this.publishedSummaries = const {},
  });

  final Future<Result<WorkspaceSummarySnapshot>> latestResult;
  final Future<Result<WorkspaceSummarySnapshot>> historyResult;
  final Map<String, ReaderSummary> publishedSummaries;
  final List<LoadWorkspaceSummaryQuery> latestQueries = [];
  final List<LoadWorkspaceSummaryQuery> historyQueries = [];
  final List<String> publishedQueries = [];

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummary(
    LoadWorkspaceSummaryQuery query,
  ) {
    latestQueries.add(query);
    return latestResult;
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummaryHistory(
    LoadWorkspaceSummaryQuery query,
  ) {
    historyQueries.add(query);
    return historyResult;
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadPublishedSummary(
    LoadPublishedSummaryQuery query,
  ) async {
    publishedQueries.add(query.summaryId);
    return Result.success(
      WorkspaceSummarySnapshot(current: publishedSummaries[query.summaryId]),
    );
  }
}

final class _SourceLauncher implements ReaderSourceLauncher {
  const _SourceLauncher();

  @override
  Future<Result<Unit>> open(Uri uri) async => const Result.success(Unit.value);
}
