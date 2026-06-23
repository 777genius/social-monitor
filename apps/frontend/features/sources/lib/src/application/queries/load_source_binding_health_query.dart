import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_binding_id.dart';
import '../../domain/value_objects/source_topic_id.dart';

final class LoadSourceBindingHealthQuery {
  const LoadSourceBindingHealthQuery({
    required this.scope,
    required this.topicId,
    required this.sourceBindingId,
  });

  final WorkspaceScope scope;
  final SourceTopicId topicId;
  final SourceBindingId sourceBindingId;
}
