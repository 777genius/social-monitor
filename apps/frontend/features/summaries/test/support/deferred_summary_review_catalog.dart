import 'dart:async';

import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/commands/decide_topic_recommendation_command.dart';
import 'package:social_monitor_summaries/src/application/commands/regenerate_summary_command.dart';
import 'package:social_monitor_summaries/src/application/commands/request_workspace_summary_command.dart';
import 'package:social_monitor_summaries/src/application/commands/submit_post_rating_command.dart';
import 'package:social_monitor_summaries/src/application/commands/submit_reader_action_command.dart';
import 'package:social_monitor_summaries/src/application/commands/submit_summary_feedback_command.dart';
import 'package:social_monitor_summaries/src/application/contracts/summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/application/queries/list_summaries_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_post_ratings_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_published_summary_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_summary_detail_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_topic_recommendations_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_workspace_summary_job_status_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_workspace_summary_query.dart';
import 'package:social_monitor_summaries/src/application/results/post_rating_submission_result.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/post_rating.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_job_snapshot.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_topic_recommendation.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_action_target.dart';

import 'summaries_test_fixtures.dart';

final class DeferredSummaryReviewCatalog implements SummaryReviewCatalog {
  DeferredSummaryReviewCatalog(
    this.items, {
    this.hangWorkspaceSummary = false,
    this.deferWorkspaceSummary = false,
    this.workspaceSummarySnapshot = const WorkspaceSummarySnapshot(),
  });

  final List<GeneratedSummary> items;
  final bool hangWorkspaceSummary;
  final bool deferWorkspaceSummary;
  final WorkspaceSummarySnapshot workspaceSummarySnapshot;
  final pendingDetails = <PendingSummaryDetailRequest>[];
  final pendingWorkspaceSummarys =
      <Completer<Result<WorkspaceSummarySnapshot>>>[];
  var summaryListLoadCount = 0;
  var workspaceSummaryLoadCount = 0;
  var workspaceSummaryHistoryLoadCount = 0;

  @override
  Future<Result<PageResult<GeneratedSummary>>> listSummaries(
    ListSummariesQuery query,
  ) {
    summaryListLoadCount += 1;
    return Future.value(Result.success(generatedSummaryPage(items)));
  }

  @override
  Future<Result<GeneratedSummary>> loadSummaryDetail(
    LoadSummaryDetailQuery query,
  ) {
    final completer = Completer<Result<GeneratedSummary>>();
    pendingDetails.add(PendingSummaryDetailRequest(query, completer));
    return completer.future;
  }

  @override
  Future<Result<GeneratedSummary>> regenerateSummary(
    RegenerateSummaryCommand command,
  ) {
    return Future.value(Result.success(items.first));
  }

  @override
  Future<Result<GeneratedSummary>> submitFeedback(
    SubmitSummaryFeedbackCommand command,
  ) {
    return Future.value(
      Result.success(
        generatedSummary(id: command.summaryId.value, feedbackSubmitted: true),
      ),
    );
  }

  @override
  Future<Result<ReaderActionResult>> submitReaderAction(
    SubmitReaderActionCommand command,
  ) {
    return Future.value(
      const Result.failure(
        UnexpectedFailure(message: 'Unexpected reader action in test'),
      ),
    );
  }

  @override
  Future<Result<PostRatingSubmissionResult>> submitPostRating(
    SubmitPostRatingCommand command,
  ) async => const Result.failure(
    UnexpectedFailure(message: 'Unexpected post rating in test'),
  );

  @override
  Future<Result<List<PostRating>>> loadPostRatings(LoadPostRatingsQuery query) {
    return Future.value(const Result.success(<PostRating>[]));
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummary(
    LoadWorkspaceSummaryQuery query,
  ) {
    workspaceSummaryLoadCount += 1;
    if (hangWorkspaceSummary) {
      return Completer<Result<WorkspaceSummarySnapshot>>().future;
    }
    if (deferWorkspaceSummary) {
      final completer = Completer<Result<WorkspaceSummarySnapshot>>();
      pendingWorkspaceSummarys.add(completer);
      return completer.future;
    }
    return Future.value(Result.success(workspaceSummarySnapshot));
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadPublishedSummary(
    LoadPublishedSummaryQuery query,
  ) => Future.value(Result.success(workspaceSummarySnapshot));

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummaryHistory(
    LoadWorkspaceSummaryQuery query,
  ) {
    workspaceSummaryHistoryLoadCount += 1;
    return Future.value(const Result.success(WorkspaceSummarySnapshot()));
  }

  @override
  Future<Result<ReaderSummaryTopicRecommendationQueue>>
  loadTopicRecommendations(LoadTopicRecommendationsQuery query) {
    final normalized = query.normalized();
    final endedAt = DateTime.utc(2026, 7, 5);

    return Future.value(
      Result.success(
        ReaderSummaryTopicRecommendationQueue(
          windowStartedAt: endedAt.subtract(
            Duration(days: normalized.windowDays),
          ),
          windowEndedAt: endedAt,
          items: const [],
        ),
      ),
    );
  }

  @override
  Future<Result<ReaderSummaryTopicRecommendationDecisionStatus>>
  decideTopicRecommendation(DecideTopicRecommendationCommand command) {
    return Future.value(
      const Result.success(
        ReaderSummaryTopicRecommendationDecisionStatus.accepted,
      ),
    );
  }

  @override
  Future<Result<ReaderSummaryJobSnapshot>> requestWorkspaceSummary(
    RequestWorkspaceSummaryCommand command,
  ) {
    return Future.value(
      const Result.failure(
        UnexpectedFailure(message: 'Unexpected summary request in test'),
      ),
    );
  }

  @override
  Future<Result<ReaderSummaryJobSnapshot>> loadWorkspaceSummaryJobStatus(
    LoadWorkspaceSummaryJobStatusQuery query,
  ) {
    return Future.value(
      const Result.failure(
        UnexpectedFailure(message: 'Unexpected summary status read in test'),
      ),
    );
  }
}

final class PendingSummaryDetailRequest {
  const PendingSummaryDetailRequest(this.query, this.completer);

  final LoadSummaryDetailQuery query;
  final Completer<Result<GeneratedSummary>> completer;

  void completeWith(GeneratedSummary summary) {
    completer.complete(Result.success(summary));
  }
}
