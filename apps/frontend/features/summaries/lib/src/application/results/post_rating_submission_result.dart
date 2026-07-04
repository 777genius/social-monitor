import '../../domain/entities/post_rating.dart';

final class PostRatingSubmissionResult {
  const PostRatingSubmissionResult({
    required this.rating,
    required this.created,
    required this.learningDirection,
  });

  final PostRating rating;
  final bool created;
  final String learningDirection;
}
