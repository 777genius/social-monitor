import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/mention_id.dart';
import '../../domain/value_objects/mention_triage_state.dart';

final class TriageMentionCommand {
  const TriageMentionCommand({
    required this.scope,
    required this.mentionId,
    required this.nextState,
  });

  final WorkspaceScope scope;
  final MentionId mentionId;
  final MentionTriageState nextState;
}
