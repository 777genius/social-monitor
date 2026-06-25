import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/reader_action_target.dart';

final class SubmitReaderActionCommand {
  const SubmitReaderActionCommand({
    required this.scope,
    required this.summaryId,
    required this.userId,
    required this.kind,
    required this.label,
    required this.target,
    required this.idempotencyKey,
    this.feedbackReason,
  });

  final WorkspaceScope scope;
  final String summaryId;
  final String userId;
  final String kind;
  final String label;
  final ReaderActionTarget target;
  final String idempotencyKey;
  final ReaderFeedbackReason? feedbackReason;
}
