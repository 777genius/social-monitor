import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/reader_summary_topic_recommendation.dart';
import '../contracts/summary_review_catalog.dart';
import '../queries/load_topic_recommendations_query.dart';

final class LoadTopicRecommendationsUseCase {
  const LoadTopicRecommendationsUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<ReaderSummaryTopicRecommendationQueue>> call(
    LoadTopicRecommendationsQuery query,
  ) {
    if (!query.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'summaries.workspace_scope_required',
          ),
        ),
      );
    }
    return _catalog.loadTopicRecommendations(query.normalized());
  }
}
