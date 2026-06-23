import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/topic_name.dart';
import '../../domain/value_objects/topic_query.dart';

final class CreateTopicCommand {
  const CreateTopicCommand({
    required this.scope,
    required this.name,
    required this.query,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final TopicName name;
  final TopicQuery query;
  final String idempotencyKey;
}
