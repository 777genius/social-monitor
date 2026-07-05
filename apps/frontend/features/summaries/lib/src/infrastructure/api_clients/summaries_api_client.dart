import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/decide_topic_recommendation_command.dart';
import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/request_workspace_summary_command.dart';
import '../../application/commands/submit_post_rating_command.dart';
import '../../application/commands/submit_reader_action_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_post_ratings_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
import '../../application/queries/load_topic_recommendations_query.dart';
import '../../application/queries/load_workspace_summary_job_status_query.dart';
import '../../application/queries/load_workspace_summary_query.dart';
import '../../domain/entities/post_rating.dart';
import '../../domain/value_objects/reader_action_target.dart';
import '../../domain/value_objects/summary_feedback_kind.dart';
import '../../domain/value_objects/summary_period.dart';
import '../../domain/value_objects/top_read_feedback_target.dart';
import '../api/post_rating_api_dto.dart';
import '../api/summary_api_dto.dart';
import '../api/topic_recommendation_api_dto.dart';

abstract interface class SummariesApiClient {
  Future<Result<SummaryPageApiDto>> listSummaries(
    ListSummariesApiRequest request,
  );

  Future<Result<SummaryApiDto>> loadSummaryDetail(
    LoadSummaryDetailApiRequest request,
  );

  Future<Result<SummaryApiDto>> regenerateSummary(
    RegenerateSummaryApiRequest request,
  );

  Future<Result<SummaryApiDto>> submitFeedback(
    SubmitSummaryFeedbackApiRequest request,
  );

  Future<Result<ReaderActionResult>> submitReaderAction(
    SubmitReaderActionApiRequest request,
  );

  Future<Result<PostRatingSubmissionApiDto>> submitPostRating(
    SubmitPostRatingApiRequest request,
  );

  Future<Result<List<PostRatingApiDto>>> loadPostRatings(
    LoadPostRatingsApiRequest request,
  );

  Future<Result<WorkspaceSummaryApiDto>> loadWorkspaceSummary(
    LoadWorkspaceSummaryApiRequest request,
  );

  Future<Result<WorkspaceSummaryApiDto>> loadWorkspaceSummaryHistory(
    LoadWorkspaceSummaryApiRequest request,
  );

  Future<Result<TopicRecommendationQueueApiDto>> loadTopicRecommendations(
    LoadTopicRecommendationsApiRequest request,
  );

  Future<Result<TopicRecommendationDecisionApiDto>> decideTopicRecommendation(
    DecideTopicRecommendationApiRequest request,
  );

  Future<Result<ReaderSummaryJobApiDto>> requestWorkspaceSummary(
    RequestWorkspaceSummaryApiRequest request,
  );

  Future<Result<ReaderSummaryJobApiDto>> loadWorkspaceSummaryJobStatus(
    LoadWorkspaceSummaryJobStatusApiRequest request,
  );
}

final class ListSummariesApiRequest {
  const ListSummariesApiRequest({
    required this.scope,
    required this.cursor,
    required this.limit,
  });

  factory ListSummariesApiRequest.fromQuery(ListSummariesQuery query) {
    final normalized = query.normalized();
    return ListSummariesApiRequest(
      scope: normalized.scope,
      cursor: normalized.page.cursor,
      limit: normalized.page.limit,
    );
  }

  final WorkspaceScope scope;
  final String? cursor;
  final int limit;
}

final class LoadSummaryDetailApiRequest {
  const LoadSummaryDetailApiRequest({
    required this.scope,
    required this.summaryId,
  });

  factory LoadSummaryDetailApiRequest.fromQuery(LoadSummaryDetailQuery query) {
    return LoadSummaryDetailApiRequest(
      scope: query.scope,
      summaryId: query.summaryId.value,
    );
  }

  final WorkspaceScope scope;
  final String summaryId;
}

final class LoadWorkspaceSummaryApiRequest {
  const LoadWorkspaceSummaryApiRequest({
    required this.scope,
    required this.period,
  });

  factory LoadWorkspaceSummaryApiRequest.fromQuery(
    LoadWorkspaceSummaryQuery query,
  ) {
    return LoadWorkspaceSummaryApiRequest(
      scope: query.scope,
      period: query.period,
    );
  }

  final WorkspaceScope scope;
  final SummaryPeriod period;
}

final class LoadTopicRecommendationsApiRequest {
  const LoadTopicRecommendationsApiRequest({
    required this.scope,
    required this.windowDays,
    required this.limit,
  });

  factory LoadTopicRecommendationsApiRequest.fromQuery(
    LoadTopicRecommendationsQuery query,
  ) {
    final normalized = query.normalized();
    return LoadTopicRecommendationsApiRequest(
      scope: normalized.scope,
      windowDays: normalized.windowDays,
      limit: normalized.limit,
    );
  }

  final WorkspaceScope scope;
  final int windowDays;
  final int limit;
}

final class DecideTopicRecommendationApiRequest {
  const DecideTopicRecommendationApiRequest({
    required this.scope,
    required this.recommendationId,
    required this.topicLabel,
    required this.action,
    required this.interestIds,
    required this.providerKeys,
    this.note,
  });

  factory DecideTopicRecommendationApiRequest.fromCommand(
    DecideTopicRecommendationCommand command,
  ) {
    final normalized = command.normalized();

    return DecideTopicRecommendationApiRequest(
      scope: normalized.scope,
      recommendationId: normalized.recommendationId,
      topicLabel: normalized.topicLabel,
      action: normalized.action.apiValue,
      interestIds: normalized.interestIds,
      providerKeys: normalized.providerKeys,
      note: normalized.note,
    );
  }

  final WorkspaceScope scope;
  final String recommendationId;
  final String topicLabel;
  final String action;
  final List<String> interestIds;
  final List<String> providerKeys;
  final String? note;
}

final class RequestWorkspaceSummaryApiRequest {
  const RequestWorkspaceSummaryApiRequest({
    required this.scope,
    required this.userId,
    required this.idempotencyKey,
    required this.period,
  });

  factory RequestWorkspaceSummaryApiRequest.fromCommand(
    RequestWorkspaceSummaryCommand command,
  ) {
    return RequestWorkspaceSummaryApiRequest(
      scope: command.scope,
      userId: command.userId,
      idempotencyKey: command.idempotencyKey,
      period: command.period,
    );
  }

  final WorkspaceScope scope;
  final String userId;
  final String idempotencyKey;
  final SummaryPeriod period;
}

final class LoadWorkspaceSummaryJobStatusApiRequest {
  const LoadWorkspaceSummaryJobStatusApiRequest({
    required this.scope,
    required this.summaryJobId,
  });

  factory LoadWorkspaceSummaryJobStatusApiRequest.fromQuery(
    LoadWorkspaceSummaryJobStatusQuery query,
  ) {
    return LoadWorkspaceSummaryJobStatusApiRequest(
      scope: query.scope,
      summaryJobId: query.summaryJobId,
    );
  }

  final WorkspaceScope scope;
  final String summaryJobId;
}

final class RegenerateSummaryApiRequest {
  const RegenerateSummaryApiRequest({
    required this.scope,
    required this.summaryId,
  });

  factory RegenerateSummaryApiRequest.fromCommand(
    RegenerateSummaryCommand command,
  ) {
    return RegenerateSummaryApiRequest(
      scope: command.scope,
      summaryId: command.summaryId.value,
    );
  }

  final WorkspaceScope scope;
  final String summaryId;
}

final class SubmitSummaryFeedbackApiRequest {
  const SubmitSummaryFeedbackApiRequest({
    required this.scope,
    required this.summaryId,
    required this.kind,
  });

  factory SubmitSummaryFeedbackApiRequest.fromCommand(
    SubmitSummaryFeedbackCommand command,
  ) {
    return SubmitSummaryFeedbackApiRequest(
      scope: command.scope,
      summaryId: command.summaryId.value,
      kind: command.kind,
    );
  }

  final WorkspaceScope scope;
  final String summaryId;
  final SummaryFeedbackKind kind;
}

final class SubmitReaderActionApiRequest {
  const SubmitReaderActionApiRequest({
    required this.scope,
    required this.summaryId,
    required this.userId,
    required this.kind,
    required this.label,
    required this.target,
    required this.idempotencyKey,
    this.rating,
    this.feedbackReason,
  });

  factory SubmitReaderActionApiRequest.fromCommand(
    SubmitReaderActionCommand command,
  ) {
    return SubmitReaderActionApiRequest(
      scope: command.scope,
      summaryId: command.summaryId,
      userId: command.userId,
      kind: command.kind,
      label: command.label,
      target: command.target,
      idempotencyKey: command.idempotencyKey,
      rating: command.rating,
      feedbackReason: command.feedbackReason,
    );
  }

  final WorkspaceScope scope;
  final String summaryId;
  final String userId;
  final String kind;
  final String label;
  final ReaderActionTarget target;
  final String idempotencyKey;
  final int? rating;
  final ReaderFeedbackReason? feedbackReason;
}

final class SubmitPostRatingApiRequest {
  const SubmitPostRatingApiRequest({
    required this.scope,
    required this.summaryId,
    required this.userId,
    required this.target,
    required this.rating,
    required this.idempotencyKey,
    this.reason,
  });

  factory SubmitPostRatingApiRequest.fromCommand(
    SubmitPostRatingCommand command,
  ) {
    return SubmitPostRatingApiRequest(
      scope: command.scope,
      summaryId: command.summaryId,
      userId: command.userId,
      target: command.target,
      rating: command.rating,
      idempotencyKey: command.idempotencyKey,
      reason: command.reason,
    );
  }

  final WorkspaceScope scope;
  final String summaryId;
  final String userId;
  final TopReadFeedbackTarget target;
  final int rating;
  final String idempotencyKey;
  final PostRatingReason? reason;
}

final class LoadPostRatingsApiRequest {
  const LoadPostRatingsApiRequest({
    required this.scope,
    required this.userId,
    required this.targets,
  });

  factory LoadPostRatingsApiRequest.fromQuery(LoadPostRatingsQuery query) {
    return LoadPostRatingsApiRequest(
      scope: query.scope,
      userId: query.userId,
      targets: query.targets,
    );
  }

  final WorkspaceScope scope;
  final String userId;
  final List<PostRatingLookupTarget> targets;
}
