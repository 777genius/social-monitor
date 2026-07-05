import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/topic_recommendation_api_dto.dart';
import 'summaries_api_client.dart';

typedef InMemoryWorkspaceFailureReader =
    AppFailure? Function(WorkspaceScope scope);

final class InMemoryTopicRecommendationReader {
  const InMemoryTopicRecommendationReader({
    required TopicRecommendationQueueApiDto? topicRecommendations,
    required InMemoryWorkspaceFailureReader workspaceFailure,
  }) : _topicRecommendations = topicRecommendations,
       _workspaceFailure = workspaceFailure;

  final TopicRecommendationQueueApiDto? _topicRecommendations;
  final InMemoryWorkspaceFailureReader _workspaceFailure;

  Future<Result<TopicRecommendationQueueApiDto>> load(
    LoadTopicRecommendationsApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    final now = DateTime.now().toUtc();

    return Result.success(
      _topicRecommendations ??
          TopicRecommendationQueueApiDto(
            windowStartedAt: now,
            windowEndedAt: now,
            items: const [],
          ),
    );
  }
}
