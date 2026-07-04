import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/post_rating.dart';
import '../../domain/value_objects/top_read_feedback_target.dart';

final class SubmitPostRatingCommand {
  const SubmitPostRatingCommand({
    required this.scope,
    required this.summaryId,
    required this.userId,
    required this.target,
    required this.rating,
    required this.idempotencyKey,
    this.reason,
  });

  final WorkspaceScope scope;
  final String summaryId;
  final String userId;
  final TopReadFeedbackTarget target;
  final int rating;
  final String idempotencyKey;
  final PostRatingReason? reason;
}
