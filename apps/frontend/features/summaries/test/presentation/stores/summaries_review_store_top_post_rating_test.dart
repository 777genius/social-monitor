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
import 'package:social_monitor_summaries/src/domain/entities/post_rating.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_action_target.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/post_rating_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/in_memory_summaries_api_client.dart';
import 'package:social_monitor_summaries/src/infrastructure/repositories/generated_summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/presentation/stores/summaries_review_store.dart';
import 'package:social_monitor_summaries/src/presentation/workflows/summaries_review_store_dependencies.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  test('loads existing top post star ratings for concrete posts', () async {
    final apiClient = InMemorySummariesApiClient(
      items: [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
      postRatings: [
        PostRatingApiDto(
          feedbackId: 'rating-c-1',
          userId: 'user-demo',
          rating: 4,
          learningEffect: 'positive',
          feedItemId: 'feed-c-1',
          sourceItemId: 'source-c-1',
          interestId: 'ai-developer-tools',
          ratedAt: DateTime.utc(2026, 7, 4, 10),
        ),
      ],
    );
    final store = _store(apiClient);

    await store.loadWorkspaceSummary();
    await Future<void>.delayed(Duration.zero);

    final summary =
        (store.workspaceSummaryState
                as ReadyViewState<WorkspaceSummarySnapshot>)
            .value
            .current!;
    final topRead = summary.content.topReads.first;

    expect(store.topPostRatingFor(summary, topRead), 4);
    expect(
      apiClient.loadPostRatingsRequests.single.targets.single.feedItemId,
      'feed-c-1',
    );
  });

  test('submits top post star rating as recorded post feedback', () async {
    final apiClient = InMemorySummariesApiClient(
      items: [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
    );
    final store = _store(apiClient);

    await store.loadWorkspaceSummary();

    final summary =
        (store.workspaceSummaryState
                as ReadyViewState<WorkspaceSummarySnapshot>)
            .value
            .current!;
    final topRead = summary.content.topReads.first;

    final submitted = await store.submitTopPostRating(
      summary,
      topRead,
      5,
      null,
    );

    final state = store.readerActionState as ReadyViewState<ReaderActionResult>;
    final request = apiClient.submittedPostRatingRequests.single;
    expect(submitted, isTrue);
    expect(apiClient.submittedReaderActionRequests, isEmpty);
    expect(state.value.kind, 'rate_post');
    expect(state.value.learningDirection, 'recorded');
    expect(request.rating, 5);
    expect(request.reason, isNull);
    expect(request.target.feedItemId, 'feed-c-1');
    expect(request.target.sourceItemId, 'source-c-1');
    expect(request.idempotencyKey, contains(':rate_post:feed-c-1:5'));
    expect(store.topPostRatingFor(summary, topRead), 5);
  });

  test('passes a required reason for low top post star ratings', () async {
    final apiClient = InMemorySummariesApiClient(
      items: [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
    );
    final store = _store(apiClient);

    await store.loadWorkspaceSummary();

    final summary =
        (store.workspaceSummaryState
                as ReadyViewState<WorkspaceSummarySnapshot>)
            .value
            .current!;
    final topRead = summary.content.topReads.first;

    final submitted = await store.submitTopPostRating(
      summary,
      topRead,
      1,
      PostRatingReason.tooOld,
    );

    final request = apiClient.submittedPostRatingRequests.single;
    expect(submitted, isTrue);
    expect(request.rating, 1);
    expect(request.reason, PostRatingReason.tooOld);
  });

  test('does not submit low top post star ratings without a reason', () async {
    final apiClient = InMemorySummariesApiClient(
      items: [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
    );
    final store = _store(apiClient);

    await store.loadWorkspaceSummary();

    final summary =
        (store.workspaceSummaryState
                as ReadyViewState<WorkspaceSummarySnapshot>)
            .value
            .current!;
    final topRead = summary.content.topReads.first;

    final submitted = await store.submitTopPostRating(
      summary,
      topRead,
      1,
      null,
    );

    expect(submitted, isFalse);
    expect(apiClient.submittedPostRatingRequests, isEmpty);
  });
}

SummariesReviewStore _store(InMemorySummariesApiClient apiClient) {
  final catalog = GeneratedSummaryReviewCatalog(apiClient: apiClient);
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
      openReaderSource: OpenReaderSourceUseCase(_NoopReaderSourceLauncher()),
    ),
    scope: summaryWorkspaceScope,
    userId: 'user-test',
    summaryRequestIdempotencyKeyFactory: (_, _) => 'summary-test-key',
    summaryPollInterval: Duration.zero,
  );
}

final class _NoopReaderSourceLauncher implements ReaderSourceLauncher {
  @override
  Future<Result<Unit>> open(Uri uri) {
    return Future.value(
      const Result.failure(
        UnexpectedFailure(message: 'Unexpected source launch in rating test'),
      ),
    );
  }
}
