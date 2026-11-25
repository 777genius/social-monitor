import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/interest_lifecycle_status.dart';

final class ListInterestsQuery {
  const ListInterestsQuery({
    required this.scope,
    this.page = const PageRequest(),
    this.search = '',
    this.status,
  });

  final WorkspaceScope scope;
  final PageRequest page;
  final String search;
  final InterestLifecycleStatus? status;

  ListInterestsQuery normalized() {
    return ListInterestsQuery(
      scope: scope,
      page: page.normalized(),
      search: search.trim(),
      status: status,
    );
  }
}
