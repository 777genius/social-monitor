import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/reader_source_launcher.dart';
import 'package:social_monitor_summaries/src/application/use_cases/list_summaries_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_summary_detail_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_job_status_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/open_reader_source_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/regenerate_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/request_workspace_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_reader_action_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_summary_feedback_use_case.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/in_memory_summaries_api_client.dart';
import 'package:social_monitor_summaries/src/infrastructure/repositories/generated_summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/presentation/stores/summaries_review_store.dart';
import 'package:social_monitor_summaries/src/presentation/workflows/summaries_review_store_dependencies.dart';

import '../../support/summaries_test_fixtures.dart';

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
    final currentWeeklyPeriod = SummaryPeriodPreset.weekly.resolve(
      now: DateTime.utc(2026, 6, 30, 12),
    );
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
}

SummariesReviewStore _store(InMemorySummariesApiClient apiClient) {
  final catalog = GeneratedSummaryReviewCatalog(apiClient: apiClient);
  return SummariesReviewStore(
    dependencies: SummariesReviewStoreDependencies(
      listSummaries: ListSummariesUseCase(catalog),
      loadWorkspaceSummary: LoadWorkspaceSummaryUseCase(catalog),
      requestWorkspaceSummary: RequestWorkspaceSummaryUseCase(catalog),
      loadWorkspaceSummaryJobStatus: LoadWorkspaceSummaryJobStatusUseCase(
        catalog,
      ),
      loadSummaryDetail: LoadSummaryDetailUseCase(catalog),
      regenerateSummary: RegenerateSummaryUseCase(catalog),
      submitFeedback: SubmitSummaryFeedbackUseCase(catalog),
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
