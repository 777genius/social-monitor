import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/post_rating.dart';
import '../commands/submit_post_rating_command.dart';
import '../contracts/post_rating_catalog.dart';
import '../results/post_rating_submission_result.dart';

final class SubmitPostRatingUseCase {
  const SubmitPostRatingUseCase(this._catalog);

  final PostRatingCatalog _catalog;

  Future<Result<PostRatingSubmissionResult>> call(
    SubmitPostRatingCommand command,
  ) {
    if (!command.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'summaries.workspace_scope_required',
          ),
        ),
      );
    }
    if (command.summaryId.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Summary id is required',
            code: 'summaries.summary_id_required',
            field: 'summaryId',
          ),
        ),
      );
    }
    if (command.userId.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Post rating requires a user id',
            code: 'summaries.post_rating_user_required',
            field: 'userId',
          ),
        ),
      );
    }
    if (command.rating < 1 || command.rating > 5) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Post rating must be between 1 and 5',
            code: 'summaries.post_rating_invalid',
            field: 'rating',
          ),
        ),
      );
    }
    if (postRatingRequiresReason(command.rating) && command.reason == null) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Post rating reason is required for 1-2 star ratings',
            code: 'summaries.post_rating_reason_required',
            field: 'reason',
          ),
        ),
      );
    }
    if (!command.target.isValid || !command.target.hasPostIdentity) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Post rating requires a concrete feed or source item',
            code: 'summaries.post_rating_target_required',
            field: 'target',
          ),
        ),
      );
    }
    if (command.idempotencyKey.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Post rating idempotency key is required',
            code: 'summaries.post_rating_idempotency_required',
            field: 'idempotencyKey',
          ),
        ),
      );
    }

    return _catalog.submitPostRating(command);
  }
}
