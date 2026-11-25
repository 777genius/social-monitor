import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/summary_feedback_kind.dart';
import '../../domain/value_objects/summary_id.dart';

final class SubmitSummaryFeedbackCommand {
  const SubmitSummaryFeedbackCommand({
    required this.scope,
    required this.summaryId,
    required this.kind,
  });

  final WorkspaceScope scope;
  final SummaryId summaryId;
  final SummaryFeedbackKind kind;
}
