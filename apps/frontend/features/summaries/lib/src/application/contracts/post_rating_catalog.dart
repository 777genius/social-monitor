import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/post_rating.dart';
import '../commands/submit_post_rating_command.dart';
import '../queries/load_post_ratings_query.dart';
import '../results/post_rating_submission_result.dart';

abstract interface class PostRatingCatalog {
  Future<Result<PostRatingSubmissionResult>> submitPostRating(
    SubmitPostRatingCommand command,
  );

  Future<Result<List<PostRating>>> loadPostRatings(LoadPostRatingsQuery query);
}
