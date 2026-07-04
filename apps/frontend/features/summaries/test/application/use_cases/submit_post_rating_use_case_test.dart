import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/commands/submit_post_rating_command.dart';
import 'package:social_monitor_summaries/src/application/contracts/summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/application/results/post_rating_submission_result.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_post_rating_use_case.dart';
import 'package:social_monitor_summaries/src/domain/entities/post_rating.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_read_feedback_target.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  test('delegates a valid concrete post rating to the catalog', () async {
    final catalog = _FakeSummaryReviewCatalog();
    final useCase = SubmitPostRatingUseCase(catalog);

    final result = await useCase(_command());

    expect(result, isA<ResultSuccess<PostRatingSubmissionResult>>());
    expect(catalog.submitted.single.rating, 5);
    expect(catalog.submitted.single.target.feedItemId, 'feed-c-1');
  });

  test('requires a reason for 1-2 star ratings', () async {
    final catalog = _FakeSummaryReviewCatalog();

    final result = await SubmitPostRatingUseCase(catalog)(_command(rating: 1));

    expect(result, isA<ResultFailure<PostRatingSubmissionResult>>());
    expect(catalog.submitted, isEmpty);
  });

  test('delegates a low rating with an explicit reason', () async {
    final catalog = _FakeSummaryReviewCatalog();

    final result = await SubmitPostRatingUseCase(catalog)(
      _command(rating: 2, reason: PostRatingReason.weakSource),
    );

    expect(result, isA<ResultSuccess<PostRatingSubmissionResult>>());
    expect(catalog.submitted.single.reason, PostRatingReason.weakSource);
  });

  test('rejects ratings outside the 1-5 range', () async {
    final catalog = _FakeSummaryReviewCatalog();
    final result = await SubmitPostRatingUseCase(catalog)(_command(rating: 6));

    expect(result, isA<ResultFailure<PostRatingSubmissionResult>>());
    expect(catalog.submitted, isEmpty);
  });

  test('rejects targets without feed or source item identity', () async {
    final catalog = _FakeSummaryReviewCatalog();
    final result = await SubmitPostRatingUseCase(catalog)(
      _command(feedItemId: null, sourceItemId: null),
    );

    expect(result, isA<ResultFailure<PostRatingSubmissionResult>>());
    expect(catalog.submitted, isEmpty);
  });
}

SubmitPostRatingCommand _command({
  int rating = 5,
  PostRatingReason? reason,
  String? feedItemId = 'feed-c-1',
  String? sourceItemId = 'source-c-1',
}) {
  return SubmitPostRatingCommand(
    scope: summaryWorkspaceScope,
    summaryId: 'summary-c-1',
    userId: 'user-demo',
    idempotencyKey: 'ws-demo:summary-c-1:rate_post:feed-c-1:5',
    rating: rating,
    reason: reason,
    target: TopReadFeedbackTarget(
      providerKey: 'reddit',
      interestId: 'ai-developer-tools',
      title: 'Reddit thread on agent reliability',
      bodyPreview: 'Operators compare ranking evidence.',
      canonicalUrl: 'https://reddit.example/r/ai/comments/c1',
      feedItemId: feedItemId,
      sourceItemId: sourceItemId,
      citationIds: const ['citation-c-1'],
    ),
  );
}

final class _FakeSummaryReviewCatalog implements SummaryReviewCatalog {
  final submitted = <SubmitPostRatingCommand>[];

  @override
  Future<Result<PostRatingSubmissionResult>> submitPostRating(
    SubmitPostRatingCommand command,
  ) async {
    submitted.add(command);
    return Result.success(
      PostRatingSubmissionResult(
        created: true,
        learningDirection: 'recorded',
        rating: PostRating(
          feedbackId: 'rating-c-1',
          userId: command.userId,
          rating: command.rating,
          learningEffect: postRatingLearningEffectFor(command.rating),
          reason: command.reason,
          target: PostRatingLookupTarget(
            feedItemId: command.target.feedItemId,
            sourceItemId: command.target.sourceItemId,
            interestId: command.target.interestId,
          ),
          ratedAt: DateTime.utc(2026, 7, 4, 10),
        ),
      ),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
