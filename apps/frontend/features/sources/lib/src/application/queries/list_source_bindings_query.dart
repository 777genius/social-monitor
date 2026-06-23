import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_topic_id.dart';

final class ListSourceBindingsQuery {
  const ListSourceBindingsQuery({
    required this.scope,
    required this.topicId,
    this.page = const PageRequest(),
  });

  final WorkspaceScope scope;
  final SourceTopicId topicId;
  final PageRequest page;
}
