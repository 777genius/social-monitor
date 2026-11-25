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
  test('prefetches adjacent days and switches without loading again', () async {
    final previous = _dailySummary('summary-july-09', 2026, 7, 9);
    final current = _dailySummary('summary-july-10', 2026, 7, 10);
    final catalog = _NavigationCacheCatalog([previous, current]);
    final selectedIds = <String>[];
    final store = _store(catalog, selectedIds.add);
    addTearDown(store.dispose);

    await store.load();
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);

    expect(catalog.requestsFor(current.id), 1);
    expect(catalog.requestsFor(previous.id), 1);

    final loadingStates = <AsyncViewState<ReaderSummary>>[];
    store.addListener(() {
      if (store.state is LoadingViewState<ReaderSummary>) {
        loadingStates.add(store.state);
      }
    });

    await store.showPreviousPeriod();
    await store.showNextPeriod();

    expect(loadingStates, isEmpty);
    expect(catalog.requestsFor(previous.id), 1);
    expect(catalog.requestsFor(current.id), 1);
    expect(selectedIds, [previous.id, current.id]);
    expect(_readySummary(store).id, current.id);
  });

  test('retries normally when an adjacent prefetch fails', () async {
    final previous = _dailySummary('summary-july-09', 2026, 7, 9);
    final current = _dailySummary('summary-july-10', 2026, 7, 10);
    final catalog = _NavigationCacheCatalog([
      previous,
      current,
    ], failFirstRequestFor: previous.id);
    final store = _store(catalog, (_) {});
    addTearDown(store.dispose);

    await store.load();
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    await store.showPreviousPeriod();

    expect(catalog.requestsFor(previous.id), 2);
    expect(_readySummary(store).id, previous.id);
  });
}

PublishedSummaryStore _store(
  _NavigationCacheCatalog catalog,
  void Function(String summaryId) onSummarySelected,
) {
  return PublishedSummaryStore(
    scope: summaryWorkspaceScope,
    loadLatest: LoadWorkspaceSummaryUseCase(catalog),
    loadHistory: LoadWorkspaceSummaryHistoryUseCase(catalog),
    loadPublished: LoadPublishedSummaryUseCase(catalog),
    openReaderSource: const OpenReaderSourceUseCase(_SourceLauncher()),
    onSummarySelected: onSummarySelected,
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

final class _NavigationCacheCatalog extends Fake
    implements SummaryReviewCatalog {
  _NavigationCacheCatalog(
    List<ReaderSummary> summaries, {
    this.failFirstRequestFor,
  }) : _summaries = {for (final summary in summaries) summary.id: summary},
       _references = [
         for (final summary in summaries)
           PublishedSummaryReference(
             summaryId: summary.id,
             period: summary.period,
           ),
       ];

  final Map<String, ReaderSummary> _summaries;
  final List<PublishedSummaryReference> _references;
  final String? failFirstRequestFor;
  final List<String> publishedQueries = [];

  int requestsFor(String summaryId) =>
      publishedQueries.where((id) => id == summaryId).length;

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadPublishedSummary(
    LoadPublishedSummaryQuery query,
  ) async {
    publishedQueries.add(query.summaryId);
    if (query.summaryId == failFirstRequestFor &&
        requestsFor(query.summaryId) == 1) {
      return const Result.failure(
        UnexpectedFailure(message: 'Temporary prefetch failure'),
      );
    }
    return Result.success(
      WorkspaceSummarySnapshot(current: _summaries[query.summaryId]),
    );
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummaryHistory(
    LoadWorkspaceSummaryQuery query,
  ) async => Result.success(
    WorkspaceSummarySnapshot(
      availablePeriods: _references
          .map((reference) => reference.period)
          .toList(growable: false),
      availableSummaryReferences: _references,
      availablePeriodsAreComplete: true,
    ),
  );

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummary(
    LoadWorkspaceSummaryQuery query,
  ) async => const Result.success(WorkspaceSummarySnapshot());
}

final class _SourceLauncher implements ReaderSourceLauncher {
  const _SourceLauncher();

  @override
  Future<Result<Unit>> open(Uri uri) async => const Result.success(Unit.value);
}
