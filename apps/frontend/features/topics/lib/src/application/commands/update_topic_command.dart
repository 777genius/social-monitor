import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/topic_id.dart';
import '../../domain/value_objects/topic_name.dart';
import '../../domain/value_objects/topic_query.dart';

final class UpdateTopicCommand {
  const UpdateTopicCommand({
    required this.scope,
    required this.topicId,
    required this.name,
    required this.query,
  });

  final WorkspaceScope scope;
  final TopicId topicId;
  final TopicName name;
  final TopicQuery query;
}
