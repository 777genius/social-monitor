import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/reader_summary_topic_recommendation.dart';
import '../commands/decide_topic_recommendation_command.dart';
import '../contracts/summary_review_catalog.dart';

final class DecideTopicRecommendationUseCase {
  const DecideTopicRecommendationUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<ReaderSummaryTopicRecommendationDecisionStatus>> call(
    DecideTopicRecommendationCommand command,
  ) {
    if (!command.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Topic recommendation decision is incomplete',
            code: 'summaries.topic_recommendation_decision_invalid',
          ),
        ),
      );
    }

    return _catalog.decideTopicRecommendation(command.normalized());
  }
}
