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
  test('loads the selected ISO week from a calendar date', () async {
    final apiClient = InMemorySummariesApiClient(
      items: [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
    );
    final store = _store(apiClient);

    await store.selectWorkspaceSummaryPeriod(SummaryPeriodPreset.weekly);
    await store.selectWorkspaceSummaryCalendarDate(DateTime(2025, 7, 9));

    final period = apiClient.loadWorkspaceSummaryRequests.last.period;
    expect(store.selectedSummaryPeriodPreset, SummaryPeriodPreset.weekly);
    expect(period.cadence, SummaryPeriodCadence.weekly);
    expect(period.startedAt, DateTime.utc(2025, 7, 7));
    expect(period.endedAt, DateTime.utc(2025, 7, 14));
    expect(period.timezone, 'UTC');
  });

  test('loads the selected month from a calendar date', () async {
    final apiClient = InMemorySummariesApiClient(
      items: [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
    );
    final store = _store(apiClient);

    await store.selectWorkspaceSummaryPeriod(SummaryPeriodPreset.monthly);
    await store.selectWorkspaceSummaryCalendarDate(DateTime(2025, 5, 23));

    final period = apiClient.loadWorkspaceSummaryRequests.last.period;
    expect(store.selectedSummaryPeriodPreset, SummaryPeriodPreset.monthly);
    expect(period.cadence, SummaryPeriodCadence.monthly);
    expect(period.startedAt, DateTime.utc(2025, 5));
    expect(period.endedAt, DateTime.utc(2025, 6));
    expect(period.timezone, 'UTC');
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
