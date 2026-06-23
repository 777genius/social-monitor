import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/topic_lifecycle_status.dart';

final class ListTopicsQuery {
  const ListTopicsQuery({
    required this.scope,
    this.page = const PageRequest(),
    this.search = '',
    this.status,
  });

  final WorkspaceScope scope;
  final PageRequest page;
  final String search;
  final TopicLifecycleStatus? status;

  ListTopicsQuery normalized() {
    return ListTopicsQuery(
      scope: scope,
      page: page.normalized(),
      search: search.trim(),
      status: status,
    );
  }
}
