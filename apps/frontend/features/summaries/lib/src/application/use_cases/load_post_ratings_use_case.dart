import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/post_rating.dart';
import '../contracts/post_rating_catalog.dart';
import '../queries/load_post_ratings_query.dart';

final class LoadPostRatingsUseCase {
  const LoadPostRatingsUseCase(this._catalog);

  final PostRatingCatalog _catalog;

  Future<Result<List<PostRating>>> call(LoadPostRatingsQuery query) {
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
    if (query.userId.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Post rating lookup requires a user id',
            code: 'summaries.post_rating_user_required',
            field: 'userId',
          ),
        ),
      );
    }

    final targetsByKey = <String, PostRatingLookupTarget>{};
    for (final target in query.targets) {
      if (!target.isValid) {
        return Future.value(
          const Result.failure(
            ValidationFailure(
              message: 'Post rating lookup target is incomplete',
              code: 'summaries.post_rating_target_required',
              field: 'targets',
            ),
          ),
        );
      }
      targetsByKey[target.key] = target;
    }

    if (targetsByKey.isEmpty) {
      return Future.value(const Result.success(<PostRating>[]));
    }

    return _catalog.loadPostRatings(
      LoadPostRatingsQuery(
        scope: query.scope,
        userId: query.userId.trim(),
        targets: targetsByKey.values.toList(growable: false),
      ),
    );
  }
}
