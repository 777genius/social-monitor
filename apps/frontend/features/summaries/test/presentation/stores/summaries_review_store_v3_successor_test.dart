import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/reader_source_launcher.dart';
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
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_job_snapshot.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/post_rating_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/in_memory_summaries_api_client.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/summaries_api_client.dart';
import 'package:social_monitor_summaries/src/infrastructure/repositories/generated_summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/presentation/stores/summaries_review_store.dart';
import 'package:social_monitor_summaries/src/presentation/workflows/summaries_review_store_dependencies.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  test('Generate keeps the normal key for a period without a publication', () async {
    final client = InMemorySummariesApiClient(items: [summaryApiDto()]);
    final store = _store(GeneratedSummaryReviewCatalog(apiClient: client));

    await store.requestWorkspaceSummary();
    await store.requestWorkspaceSummary();

    expect(
      client.requestWorkspaceSummaryRequests.map(
        (request) => request.idempotencyKey,
      ),
      everyElement('summary-test-key'),
    );
  });

  test('Generate does not supersede an in-flight legacy request', () async {
    final client = _LegacyPeriodApiClient(
      InMemorySummariesApiClient(
        items: [summaryApiDto()],
        workspaceSummary: readerSummaryApiDto(),
      ),
      normalStatus: 'running',
    );
    final store = _store(GeneratedSummaryReviewCatalog(apiClient: client));
    await store.loadWorkspaceSummary();

    await store.requestWorkspaceSummary();

    expect(client.requests.map((request) => request.idempotencyKey), [
      'summary-test-key',
    ]);
  });

  test('Generate keeps a newly created job for a published period', () async {
    final client = InMemorySummariesApiClient(
      items: [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
    );
    final store = _store(GeneratedSummaryReviewCatalog(apiClient: client));
    await store.loadWorkspaceSummary();

    await store.requestWorkspaceSummary();

    expect(
      client.requestWorkspaceSummaryRequests.map(
        (request) => request.idempotencyKey,
      ),
      ['summary-test-key'],
    );
  });

  for (final cadence in ['daily', 'weekly']) {
    test('Generate retains a published $cadence period during V3 rollback', () async {
      final period = cadence == 'daily'
          ? summaryPeriodApiDto()
          : summaryPeriodApiDto(
              cadence: 'weekly',
              startedAt: DateTime.utc(2026, 6, 22),
              endedAt: DateTime.utc(2026, 6, 29),
              periodKey:
                  'weekly:2026-06-22T00:00:00.000Z:2026-06-29T00:00:00.000Z:UTC',
            );
      final client = _LegacyPeriodApiClient(
        InMemorySummariesApiClient(
          items: [summaryApiDto()],
          workspaceSummary: readerSummaryApiDto(period: period),
        ),
        rolloutDisabled: true,
      );
      final store = _store(GeneratedSummaryReviewCatalog(apiClient: client));
      if (cadence == 'weekly') {
        await store.selectWorkspaceSummaryPeriod(SummaryPeriodPreset.weekly);
      } else {
        await store.loadWorkspaceSummary();
      }

      await store.requestWorkspaceSummary();

      expect(client.requests.map((request) => request.idempotencyKey), [
        'summary-test-key',
        'v3-successor:summary-test-key',
      ]);
      expect(
        (store.summaryJobState as ReadyViewState<ReaderSummaryJobSnapshot>)
            .value.id,
        'legacy-job',
      );
      expect(
        (store.workspaceSummaryState as ReadyViewState<WorkspaceSummarySnapshot>)
            .value.current?.id,
        'readerSummary-1',
      );
    });

    test('Generate uses one stable V3 successor key for $cadence', () async {
      final period = cadence == 'daily'
          ? summaryPeriodApiDto()
          : summaryPeriodApiDto(
              cadence: 'weekly',
              startedAt: DateTime.utc(2026, 6, 22),
              endedAt: DateTime.utc(2026, 6, 29),
              periodKey:
                  'weekly:2026-06-22T00:00:00.000Z:2026-06-29T00:00:00.000Z:UTC',
            );
      final client = _LegacyPeriodApiClient(
        InMemorySummariesApiClient(
          items: [summaryApiDto()],
          workspaceSummary: readerSummaryApiDto(period: period),
        ),
      );
      final catalog = GeneratedSummaryReviewCatalog(apiClient: client);
      final store = _store(catalog);
      if (cadence == 'weekly') {
        await store.selectWorkspaceSummaryPeriod(SummaryPeriodPreset.weekly);
      } else {
        await store.loadWorkspaceSummary();
      }

      await store.requestWorkspaceSummary();
      await store.requestWorkspaceSummary();

      expect(client.requests, hasLength(4));
      expect(
        client.requests.map(
          (request) => request.idempotencyKey,
        ),
        [
          'summary-test-key',
          'v3-successor:summary-test-key',
          'summary-test-key',
          'v3-successor:summary-test-key',
        ],
      );
      expect(
        client.requests.last.period.cadence.name,
        cadence,
      );
      expect(
        (store.workspaceSummaryState as ReadyViewState<WorkspaceSummarySnapshot>)
            .value.current?.id,
        'readerSummary-1',
      );
    });
  }
}

SummariesReviewStore _store(GeneratedSummaryReviewCatalog catalog) {
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
      openReaderSource: OpenReaderSourceUseCase(_NoopSourceLauncher()),
    ),
    scope: summaryWorkspaceScope,
    userId: 'user-test',
    summaryRequestIdempotencyKeyFactory: (_, _) => 'summary-test-key',
    summaryPollInterval: Duration.zero,
  );
}

final class _LegacyPeriodApiClient implements SummariesApiClient {
  _LegacyPeriodApiClient(
    this.delegate, {
    this.normalStatus = 'completed',
    this.rolloutDisabled = false,
  });

  final InMemorySummariesApiClient delegate;
  final String normalStatus;
  final bool rolloutDisabled;
  final requests = <RequestWorkspaceSummaryApiRequest>[];

  @override
  Future<Result<WorkspaceSummaryApiDto>> loadWorkspaceSummary(
    LoadWorkspaceSummaryApiRequest request,
  ) => delegate.loadWorkspaceSummary(request);

  @override
  Future<Result<WorkspaceSummaryApiDto>> loadWorkspaceSummaryHistory(
    LoadWorkspaceSummaryApiRequest request,
  ) => delegate.loadWorkspaceSummaryHistory(request);

  @override
  Future<Result<List<PostRatingApiDto>>> loadPostRatings(
    LoadPostRatingsApiRequest request,
  ) => delegate.loadPostRatings(request);

  @override
  Future<Result<ReaderSummaryJobApiDto>> requestWorkspaceSummary(
    RequestWorkspaceSummaryApiRequest request,
  ) {
    requests.add(request);
    if (request.idempotencyKey == 'summary-test-key' || rolloutDisabled) {
      return Future.value(
        Result.success(
          ReaderSummaryJobApiDto(
            id: 'legacy-job',
            status: normalStatus,
            summaryId: 'readerSummary-1',
          ),
        ),
      );
    }
    return delegate.requestWorkspaceSummary(request);
  }

  @override
  Future<Result<ReaderSummaryJobApiDto>> loadWorkspaceSummaryJobStatus(
    LoadWorkspaceSummaryJobStatusApiRequest request,
  ) => delegate.loadWorkspaceSummaryJobStatus(request);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

final class _NoopSourceLauncher implements ReaderSourceLauncher {
  @override
  Future<Result<Unit>> open(Uri uri) async => const Result.success(Unit.value);
}
