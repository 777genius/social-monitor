final class PostRatingApiDto {
  const PostRatingApiDto({
    required this.feedbackId,
    required this.userId,
    required this.rating,
    required this.learningEffect,
    required this.feedItemId,
    required this.sourceItemId,
    required this.interestId,
    required this.ratedAt,
    this.reason,
  });

  final String feedbackId;
  final String userId;
  final int rating;
  final String learningEffect;
  final String? feedItemId;
  final String? sourceItemId;
  final String interestId;
  final DateTime ratedAt;
  final String? reason;
}

final class PostRatingSubmissionApiDto {
  const PostRatingSubmissionApiDto({
    required this.rating,
    required this.created,
    required this.learningDirection,
  });

  final PostRatingApiDto rating;
  final bool created;
  final String learningDirection;
}
