import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/decide_topic_recommendation_command.dart';
import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/request_workspace_summary_command.dart';
import '../../application/commands/submit_post_rating_command.dart';
import '../../application/commands/submit_reader_action_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/contracts/summary_review_catalog.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_post_ratings_query.dart';
import '../../application/queries/load_published_summary_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
import '../../application/queries/load_topic_recommendations_query.dart';
import '../../application/queries/load_workspace_summary_job_status_query.dart';
import '../../application/queries/load_workspace_summary_query.dart';
import '../../application/results/post_rating_submission_result.dart';
import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/generated_summary.dart';
import '../../domain/entities/post_rating.dart';
import '../../domain/entities/reader_summary_job_snapshot.dart';
import '../../domain/entities/reader_summary_topic_recommendation.dart';
import '../../domain/value_objects/reader_action_target.dart';
import '../api/post_rating_api_dto.dart';
import '../api/summary_api_dto.dart';
import '../api_clients/summaries_api_client.dart';
import '../mappers/summary_mapper.dart';
import '../mappers/topic_recommendation_mapper.dart';

final class GeneratedSummaryReviewCatalog implements SummaryReviewCatalog {
  static const _postRatingLookupBatchSize = 100;

  const GeneratedSummaryReviewCatalog({
    required SummariesApiClient apiClient,
    SummaryMapper mapper = const SummaryMapper(),
    TopicRecommendationMapper topicRecommendationMapper =
        const TopicRecommendationMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper,
       _topicRecommendationMapper = topicRecommendationMapper;

  final SummariesApiClient _apiClient;
  final SummaryMapper _mapper;
  final TopicRecommendationMapper _topicRecommendationMapper;

  @override
  Future<Result<PageResult<GeneratedSummary>>> listSummaries(
    ListSummariesQuery query,
  ) async {
    final normalized = query.normalized();
    final result = await _apiClient.listSummaries(
      ListSummariesApiRequest.fromQuery(normalized),
    );
    return result.fold(
      onSuccess: (page) => Result.success(
        PageResult<GeneratedSummary>(
          items: page.items.map(_mapper.toDomain).toList(growable: false),
          request: normalized.page,
          nextCursor: page.nextCursor,
        ),
      ),
      onFailure: Result<PageResult<GeneratedSummary>>.failure,
    );
  }

  @override
  Future<Result<GeneratedSummary>> loadSummaryDetail(
    LoadSummaryDetailQuery query,
  ) async {
    final result = await _apiClient.loadSummaryDetail(
      LoadSummaryDetailApiRequest.fromQuery(query),
    );
    return _mapSummary(result);
  }

  @override
  Future<Result<GeneratedSummary>> regenerateSummary(
    RegenerateSummaryCommand command,
  ) async {
    final result = await _apiClient.regenerateSummary(
      RegenerateSummaryApiRequest.fromCommand(command),
    );
    return _mapSummary(result);
  }

  @override
  Future<Result<GeneratedSummary>> submitFeedback(
    SubmitSummaryFeedbackCommand command,
  ) async {
    final result = await _apiClient.submitFeedback(
      SubmitSummaryFeedbackApiRequest.fromCommand(command),
    );
    return _mapSummary(result);
  }

  @override
  Future<Result<ReaderActionResult>> submitReaderAction(
    SubmitReaderActionCommand command,
  ) {
    return _apiClient.submitReaderAction(
      SubmitReaderActionApiRequest.fromCommand(command),
    );
  }

  @override
  Future<Result<PostRatingSubmissionResult>> submitPostRating(
    SubmitPostRatingCommand command,
  ) async {
    final result = await _apiClient.submitPostRating(
      SubmitPostRatingApiRequest.fromCommand(command),
    );
    return result.fold(
      onSuccess: (submission) => Result.success(
        PostRatingSubmissionResult(
          rating: _postRatingFromApi(submission.rating),
          created: submission.created,
          learningDirection: submission.learningDirection,
        ),
      ),
      onFailure: Result<PostRatingSubmissionResult>.failure,
    );
  }

  @override
  Future<Result<List<PostRating>>> loadPostRatings(
    LoadPostRatingsQuery query,
  ) async {
    final ratings = <PostRating>[];
    for (
      var offset = 0;
      offset < query.targets.length;
      offset += _postRatingLookupBatchSize
    ) {
      final end = (offset + _postRatingLookupBatchSize).clamp(
        0,
        query.targets.length,
      );
      final result = await _apiClient.loadPostRatings(
        LoadPostRatingsApiRequest.fromQuery(
          LoadPostRatingsQuery(
            scope: query.scope,
            userId: query.userId,
            targets: query.targets.sublist(offset, end),
          ),
        ),
      );
      switch (result) {
        case ResultSuccess(:final value):
          ratings.addAll(value.map(_postRatingFromApi));
        case ResultFailure(:final failure):
          return Result.failure(failure);
      }
    }
    return Result.success(ratings);
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummary(
    LoadWorkspaceSummaryQuery query,
  ) async {
    final result = await _apiClient.loadWorkspaceSummary(
      LoadWorkspaceSummaryApiRequest.fromQuery(query),
    );
    return _mapWorkspaceSummary(result);
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadPublishedSummary(
    LoadPublishedSummaryQuery query,
  ) async {
    final result = await _apiClient.loadPublishedSummary(
      LoadPublishedSummaryApiRequest.fromQuery(query),
    );
    return _mapWorkspaceSummary(result);
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummaryHistory(
    LoadWorkspaceSummaryQuery query,
  ) async {
    final result = await _apiClient.loadWorkspaceSummaryHistory(
      LoadWorkspaceSummaryApiRequest.fromQuery(query),
    );
    return _mapWorkspaceSummary(result);
  }

  @override
  Future<Result<ReaderSummaryTopicRecommendationQueue>>
  loadTopicRecommendations(LoadTopicRecommendationsQuery query) async {
    final result = await _apiClient.loadTopicRecommendations(
      LoadTopicRecommendationsApiRequest.fromQuery(query),
    );
    return result.fold(
      onSuccess: (dto) =>
          Result.success(_topicRecommendationMapper.toDomain(dto)),
      onFailure: Result<ReaderSummaryTopicRecommendationQueue>.failure,
    );
  }

  @override
  Future<Result<ReaderSummaryTopicRecommendationDecisionStatus>>
  decideTopicRecommendation(DecideTopicRecommendationCommand command) async {
    final result = await _apiClient.decideTopicRecommendation(
      DecideTopicRecommendationApiRequest.fromCommand(command),
    );

    return result.fold(
      onSuccess: (dto) => Result.success(
        ReaderSummaryTopicRecommendationDecisionStatus.fromApiValue(dto.status),
      ),
      onFailure: Result<ReaderSummaryTopicRecommendationDecisionStatus>.failure,
    );
  }

  @override
  Future<Result<ReaderSummaryJobSnapshot>> requestWorkspaceSummary(
    RequestWorkspaceSummaryCommand command,
  ) async {
    final result = await _apiClient.requestWorkspaceSummary(
      RequestWorkspaceSummaryApiRequest.fromCommand(command),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.summaryJobToDomain(dto)),
      onFailure: Result<ReaderSummaryJobSnapshot>.failure,
    );
  }

  @override
  Future<Result<ReaderSummaryJobSnapshot>> loadWorkspaceSummaryJobStatus(
    LoadWorkspaceSummaryJobStatusQuery query,
  ) async {
    final result = await _apiClient.loadWorkspaceSummaryJobStatus(
      LoadWorkspaceSummaryJobStatusApiRequest.fromQuery(query),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.summaryJobToDomain(dto)),
      onFailure: Result<ReaderSummaryJobSnapshot>.failure,
    );
  }

  Result<GeneratedSummary> _mapSummary(Result<SummaryApiDto> result) {
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<GeneratedSummary>.failure,
    );
  }

  Result<WorkspaceSummarySnapshot> _mapWorkspaceSummary(
    Result<WorkspaceSummaryApiDto> result,
  ) {
    return result.fold(
      onSuccess: (dto) => Result.success(
        WorkspaceSummarySnapshot(
          current: dto.current == null
              ? null
              : _mapper.readerSummaryToDomain(dto.current!),
          availablePeriods: dto.availablePeriods
              .map(_mapper.summaryPeriodToDomain)
              .toList(growable: false),
          availableSummaryReferences: dto.availableSummaryReferences
              .map(
                (reference) => PublishedSummaryReference(
                  summaryId: reference.summaryId,
                  period: _mapper.summaryPeriodToDomain(reference.period),
                ),
              )
              .toList(growable: false),
          availablePeriodsAreComplete: dto.availablePeriodsAreComplete,
        ),
      ),
      onFailure: Result<WorkspaceSummarySnapshot>.failure,
    );
  }

  PostRating _postRatingFromApi(PostRatingApiDto rating) {
    return PostRating(
      feedbackId: rating.feedbackId,
      userId: rating.userId,
      rating: rating.rating,
      learningEffect: PostRatingLearningEffect.fromApiValue(
        rating.learningEffect,
      ),
      reason: PostRatingReason.fromApiValue(rating.reason),
      target: PostRatingLookupTarget(
        feedItemId: rating.feedItemId,
        sourceItemId: rating.sourceItemId,
        interestId: rating.interestId,
      ),
      ratedAt: rating.ratedAt,
    );
  }
}
