enum PostRatingLearningEffect {
  negative('negative'),
  neutral('neutral'),
  positive('positive'),
  unknown('unknown');

  const PostRatingLearningEffect(this.apiValue);

  final String apiValue;

  static PostRatingLearningEffect fromApiValue(String? value) {
    return switch (value) {
      'negative' => PostRatingLearningEffect.negative,
      'neutral' => PostRatingLearningEffect.neutral,
      'positive' => PostRatingLearningEffect.positive,
      _ => PostRatingLearningEffect.unknown,
    };
  }
}

enum PostRatingReason {
  duplicate('duplicate', 'Duplicate'),
  offTopic('off_topic', 'Off-topic'),
  weakSource('weak_source', 'Weak source'),
  tooOld('too_old', 'Too old'),
  lowQuality('low_quality', 'Low quality');

  const PostRatingReason(this.apiValue, this.label);

  final String apiValue;
  final String label;

  static PostRatingReason? fromApiValue(String? value) {
    return switch (value) {
      'duplicate' => PostRatingReason.duplicate,
      'off_topic' => PostRatingReason.offTopic,
      'weak_source' => PostRatingReason.weakSource,
      'too_old' => PostRatingReason.tooOld,
      'low_quality' => PostRatingReason.lowQuality,
      _ => null,
    };
  }
}

final class PostRatingLookupTarget {
  const PostRatingLookupTarget({
    required this.interestId,
    this.feedItemId,
    this.sourceItemId,
  });

  final String? feedItemId;
  final String? sourceItemId;
  final String interestId;

  bool get isValid {
    return interestId.trim().isNotEmpty &&
        ((feedItemId?.trim().isNotEmpty ?? false) ||
            (sourceItemId?.trim().isNotEmpty ?? false));
  }

  String get key {
    final normalizedFeedItemId = feedItemId?.trim();
    final normalizedSourceItemId = sourceItemId?.trim();
    final identity =
        normalizedFeedItemId != null && normalizedFeedItemId.isNotEmpty
        ? 'feed:$normalizedFeedItemId'
        : 'source:${normalizedSourceItemId ?? ''}';

    return '${interestId.trim()}|$identity';
  }
}

final class PostRating {
  const PostRating({
    required this.feedbackId,
    required this.userId,
    required this.rating,
    required this.learningEffect,
    required this.target,
    required this.ratedAt,
    this.reason,
  });

  final String feedbackId;
  final String userId;
  final int rating;
  final PostRatingLearningEffect learningEffect;
  final PostRatingLookupTarget target;
  final DateTime ratedAt;
  final PostRatingReason? reason;

  String get key => target.key;
}

bool postRatingRequiresReason(int rating) => rating >= 1 && rating <= 2;

PostRatingLearningEffect postRatingLearningEffectFor(int rating) {
  if (rating <= 2) {
    return PostRatingLearningEffect.negative;
  }
  if (rating == 3) {
    return PostRatingLearningEffect.neutral;
  }
  if (rating >= 4 && rating <= 5) {
    return PostRatingLearningEffect.positive;
  }
  return PostRatingLearningEffect.unknown;
}
