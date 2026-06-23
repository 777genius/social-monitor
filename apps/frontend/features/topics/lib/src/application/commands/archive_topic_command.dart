import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/topic_id.dart';

final class ArchiveTopicCommand {
  const ArchiveTopicCommand({required this.scope, required this.topicId});

  final WorkspaceScope scope;
  final TopicId topicId;
}
