import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/briefing_reader_action_target.dart';

final class SubmitBriefingReaderActionCommand {
  const SubmitBriefingReaderActionCommand({
    required this.scope,
    required this.briefingId,
    required this.userId,
    required this.kind,
    required this.label,
    required this.target,
    required this.idempotencyKey,
    this.feedbackReason,
  });

  final WorkspaceScope scope;
  final String briefingId;
  final String userId;
  final String kind;
  final String label;
  final BriefingReaderActionTarget target;
  final String idempotencyKey;
  final BriefingReaderFeedbackReason? feedbackReason;
}
