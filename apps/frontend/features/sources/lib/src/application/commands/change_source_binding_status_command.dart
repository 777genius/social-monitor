import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_binding_id.dart';
import '../../domain/value_objects/source_binding_status.dart';
import '../../domain/value_objects/source_topic_id.dart';

final class ChangeSourceBindingStatusCommand {
  const ChangeSourceBindingStatusCommand({
    required this.scope,
    required this.topicId,
    required this.sourceBindingId,
    required this.status,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final SourceTopicId topicId;
  final SourceBindingId sourceBindingId;
  final SourceBindingStatus status;
  final String idempotencyKey;
}
