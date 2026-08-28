import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/reader_source_launcher.dart';
import 'package:social_monitor_summaries/src/application/contracts/summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/application/use_cases/decide_topic_recommendation_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/list_summaries_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_post_ratings_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_summary_detail_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_topic_recommendations_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_history_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_job_status_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/open_reader_source_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/regenerate_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/request_workspace_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_post_rating_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_reader_action_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_summary_feedback_use_case.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/in_memory_summaries_api_client.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/repositories/generated_summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/presentation/stores/summaries_review_store.dart';
import 'package:social_monitor_summaries/src/presentation/workflows/summaries_review_store_dependencies.dart';

import '../../support/summaries_test_fixtures.dart';
import '../../support/deferred_summary_review_catalog.dart';

void main() {
  test('does not navigate to periods without a workspace summary', () async {
    final apiClient = InMemorySummariesApiClient(
      items: [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
    );
    final store = _store(apiClient);

    await store.loadWorkspaceSummary();
    final selectedPeriod = store.selectedSummaryPeriod;

    expect(store.canShowPreviousSummaryPeriod, isFalse);

    await store.showPreviousWorkspaceSummaryPeriod();

    expect(store.selectedSummaryPeriod, selectedPeriod);
  });

  test('navigates only through available workspace summary periods', () async {
    final currentWeeklyPeriod = SummaryPeriodPreset.weekly.resolve();
    final previousWeeklyPeriod = SummaryPeriod(
      cadence: SummaryPeriodCadence.weekly,
      startedAt: currentWeeklyPeriod.startedAt.subtract(
        const Duration(days: 7),
      ),
      endedAt: currentWeeklyPeriod.startedAt,
      timezone: 'UTC',
    );
    final apiClient = InMemorySummariesApiClient(
      items: [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
      workspaceSummaryAvailablePeriods: [
        summaryPeriodApiDto(
          cadence: 'weekly',
          startedAt: previousWeeklyPeriod.startedAt,
          endedAt: previousWeeklyPeriod.endedAt,
          periodKey: null,
        ),
        summaryPeriodApiDto(
          cadence: 'weekly',
          startedAt: currentWeeklyPeriod.startedAt,
          endedAt: currentWeeklyPeriod.endedAt,
          periodKey: null,
        ),
      ],
    );
    final store = _store(apiClient);

    await store.selectWorkspaceSummaryPeriod(SummaryPeriodPreset.weekly);

    expect(store.canShowPreviousSummaryPeriod, isTrue);

    await store.showPreviousWorkspaceSummaryPeriod();

    expect(store.selectedSummaryPeriod.endedAt, previousWeeklyPeriod.endedAt);
    expect(store.canShowNextSummaryPeriod, isTrue);
    expect(
      apiClient.loadWorkspaceSummaryRequests.last.period.endedAt,
      previousWeeklyPeriod.endedAt,
    );

    await store.showNextWorkspaceSummaryPeriod();

    expect(store.selectedSummaryPeriod.endedAt, currentWeeklyPeriod.endedAt);
    expect(store.isSelectedSummaryPeriodCurrent, isTrue);
  });

  test(
    'keeps selected period when only older workspace summaries exist',
    () async {
      final olderPeriod = SummaryPeriodPreset.daily.resolveForCalendarDate(
        DateTime(2026, 6, 21),
        now: DateTime.utc(2026, 7, 2, 12),
      );
      final apiClient = InMemorySummariesApiClient(
        items: [summaryApiDto()],
        workspaceSummaryAvailablePeriods: [
          summaryPeriodApiDto(
            startedAt: olderPeriod.startedAt,
            endedAt: olderPeriod.endedAt,
            periodKey: null,
          ),
        ],
      );
      final store = _store(apiClient);
      final selectedPeriod = store.selectedSummaryPeriod;

      await store.loadWorkspaceSummary();

      expect(store.selectedSummaryPeriod, selectedPeriod);
      expect(
        store.workspaceSummaryState,
        isA<ReadyViewState<WorkspaceSummarySnapshot>>(),
      );
      final snapshot =
          (store.workspaceSummaryState
                  as ReadyViewState<WorkspaceSummarySnapshot>)
              .value;
      expect(snapshot.current, isNull);
      expect(store.availableWorkspaceSummaryPeriods, hasLength(1));
      expect(
        store.availableWorkspaceSummaryPeriods.single.endedAt,
        olderPeriod.endedAt,
      );
    },
  );

  test(
    'keeps calendar periods available when selected day has no summary',
    () async {
      final yesterdayPeriod = SummaryPeriodPreset.daily.resolveForCalendarDate(
        DateTime(2026, 7, 1),
        now: DateTime.utc(2026, 7, 2, 12),
      );
      final previousPeriod = SummaryPeriodPreset.daily.resolveForCalendarDate(
        DateTime(2026, 6, 30),
        now: DateTime.utc(2026, 7, 2, 12),
      );
      final apiClient = InMemorySummariesApiClient(
        items: [summaryApiDto()],
        workspaceSummaryAvailablePeriods: [
          summaryPeriodApiDto(
            startedAt: previousPeriod.startedAt,
            endedAt: previousPeriod.endedAt,
            periodKey: null,
          ),
          summaryPeriodApiDto(
            startedAt: yesterdayPeriod.startedAt,
            endedAt: yesterdayPeriod.endedAt,
            periodKey: null,
          ),
        ],
      );
      final store = _store(apiClient);

      await store.loadWorkspaceSummary();

      final available = store.availableWorkspaceSummaryPeriods;
      expect(available, hasLength(2));
      expect(
        available.map((period) => period.startedAt).toSet(),
        containsAll([previousPeriod.startedAt, yesterdayPeriod.startedAt]),
      );
      expect(store.canShowPreviousSummaryPeriod, isTrue);
    },
  );

  test(
    'allows latest fallback only for default workspace summary load',
    () async {
      final selectedPeriod = SummaryPeriodPreset.daily.resolveForCalendarDate(
        DateTime(2026, 7, 5),
      );
      final apiClient = InMemorySummariesApiClient(
        items: [summaryApiDto()],
        workspaceSummary: readerSummaryApiDto(),
        workspaceSummaryAvailablePeriods: [
          summaryPeriodApiDto(
            startedAt: selectedPeriod.startedAt,
            endedAt: selectedPeriod.endedAt,
            periodKey: null,
          ),
        ],
      );
      final store = _store(apiClient);

      await store.loadWorkspaceSummary();

      expect(
        apiClient.loadWorkspaceSummaryRequests.last.allowLatestFallback,
        true,
      );

      await store.selectWorkspaceSummaryCalendarDate(DateTime(2026, 7, 5));

      expect(
        apiClient.loadWorkspaceSummaryRequests.last.allowLatestFallback,
        false,
      );
    },
  );

  test(
    'shows the live partial period while viewing the latest summary',
    () async {
      final rollingPeriod = summaryPeriodApiDto(
        startedAt: DateTime.utc(2026, 8, 15),
        endedAt: DateTime.utc(2026, 8, 15, 8, 15),
        periodKey: null,
      );
      final apiClient = InMemorySummariesApiClient(
        items: [summaryApiDto()],
        workspaceSummary: readerSummaryApiDto(period: rollingPeriod),
      );
      final store = _store(apiClient);

      await store.loadWorkspaceSummary();

      expect(store.selectedSummaryPeriod.startedAt, rollingPeriod.startedAt);
      expect(store.selectedSummaryPeriod.endedAt, rollingPeriod.endedAt);
      expect(store.isViewingLatestWorkspaceSummary, isTrue);
      expect(store.isSelectedSummaryPeriodCurrent, isTrue);
    },
  );

  test('keeps the previous summary visible while another day loads', () async {
    final catalog = DeferredSummaryReviewCatalog(
      const [],
      deferWorkspaceSummary: true,
    );
    final store = _storeWithCatalog(catalog);
    final selectedDate = DateTime(2026, 7, 5);
    final selectedPeriod = SummaryPeriodPreset.daily.resolveForCalendarDate(
      selectedDate,
    );
    final previous = WorkspaceSummarySnapshot(
      current: const SummaryMapper().readerSummaryToDomain(
        readerSummaryApiDto(title: 'Previous day summary'),
      ),
      availablePeriods: [selectedPeriod],
    );
    final next = WorkspaceSummarySnapshot(
      current: const SummaryMapper().readerSummaryToDomain(
        readerSummaryApiDto(
          id: 'readerSummary-next',
          title: 'Selected day summary',
          period: summaryPeriodApiDto(
            startedAt: selectedPeriod.startedAt,
            endedAt: selectedPeriod.endedAt,
            periodKey: null,
          ),
        ),
      ),
    );

    final initialLoad = store.loadWorkspaceSummary();
    await Future<void>.delayed(Duration.zero);
    catalog.pendingWorkspaceSummarys.single.complete(Result.success(previous));
    await initialLoad;

    final navigation = store.selectWorkspaceSummaryCalendarDate(selectedDate);
    await Future<void>.delayed(Duration.zero);

    final loading =
        store.workspaceSummaryState
            as LoadingViewState<WorkspaceSummarySnapshot>;
    expect(loading.previousValue?.current?.title, 'Previous day summary');
    expect(store.availableWorkspaceSummaryPeriods, hasLength(2));
    expect(catalog.pendingWorkspaceSummarys, hasLength(2));

    catalog.pendingWorkspaceSummarys.last.complete(Result.success(next));
    await navigation;

    final ready =
        store.workspaceSummaryState as ReadyViewState<WorkspaceSummarySnapshot>;
    expect(ready.value.current?.title, 'Selected day summary');
    expect(store.availableWorkspaceSummaryPeriods, hasLength(2));
  });

  test('does not inherit a daily window when switching to weekly', () async {
    final catalog = DeferredSummaryReviewCatalog(
      const [],
      deferWorkspaceSummary: true,
    );
    final store = _storeWithCatalog(catalog);
    final dailySnapshot = WorkspaceSummarySnapshot(
      current: const SummaryMapper().readerSummaryToDomain(
        readerSummaryApiDto(title: 'Daily summary'),
      ),
    );

    final initialLoad = store.loadWorkspaceSummary();
    await Future<void>.delayed(Duration.zero);
    catalog.pendingWorkspaceSummarys.single.complete(
      Result.success(dailySnapshot),
    );
    await initialLoad;

    final navigation = store.selectWorkspaceSummaryPeriod(
      SummaryPeriodPreset.weekly,
    );
    await Future<void>.delayed(Duration.zero);

    expect(
      catalog.workspaceSummaryQueries.last.period.cadence,
      SummaryPeriodCadence.weekly,
    );
    final loading =
        store.workspaceSummaryState
            as LoadingViewState<WorkspaceSummarySnapshot>;
    expect(loading.previousValue?.current, isNull);

    catalog.pendingWorkspaceSummarys.last.complete(
      const Result.success(WorkspaceSummarySnapshot()),
    );
    await navigation;
  });
}

SummariesReviewStore _store(InMemorySummariesApiClient apiClient) {
  final catalog = GeneratedSummaryReviewCatalog(apiClient: apiClient);
  return _storeWithCatalog(catalog);
}

SummariesReviewStore _storeWithCatalog(SummaryReviewCatalog catalog) {
  return SummariesReviewStore(
    dependencies: SummariesReviewStoreDependencies(
      listSummaries: ListSummariesUseCase(catalog),
      loadWorkspaceSummary: LoadWorkspaceSummaryUseCase(catalog),
      loadWorkspaceSummaryHistory: LoadWorkspaceSummaryHistoryUseCase(catalog),
      requestWorkspaceSummary: RequestWorkspaceSummaryUseCase(catalog),
      loadWorkspaceSummaryJobStatus: LoadWorkspaceSummaryJobStatusUseCase(
        catalog,
      ),
      loadSummaryDetail: LoadSummaryDetailUseCase(catalog),
      loadTopicRecommendations: LoadTopicRecommendationsUseCase(catalog),
      decideTopicRecommendation: DecideTopicRecommendationUseCase(catalog),
      loadPostRatings: LoadPostRatingsUseCase(catalog),
      regenerateSummary: RegenerateSummaryUseCase(catalog),
      submitFeedback: SubmitSummaryFeedbackUseCase(catalog),
      submitPostRating: SubmitPostRatingUseCase(catalog),
      submitReaderAction: SubmitReaderActionUseCase(catalog),
      openReaderSource: const OpenReaderSourceUseCase(
        _FakeReaderSourceLauncher(),
      ),
    ),
    scope: summaryWorkspaceScope,
    userId: 'user-test',
    summaryPollInterval: Duration.zero,
  );
}

final class _FakeReaderSourceLauncher implements ReaderSourceLauncher {
  const _FakeReaderSourceLauncher();

  @override
  Future<Result<Unit>> open(Uri uri) async => const Result.success(Unit.value);
}
