import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/topic_name.dart';
import '../../domain/value_objects/topic_rules.dart';

final class CreateTopicCommand {
  const CreateTopicCommand({
    required this.scope,
    required this.name,
    required this.rules,
  });

  final WorkspaceScope scope;
  final TopicName name;
  final TopicRules rules;
}
