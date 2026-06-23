import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class ListSummariesQuery {
  const ListSummariesQuery({
    required this.scope,
    this.page = const PageRequest(),
  });

  final WorkspaceScope scope;
  final PageRequest page;

  ListSummariesQuery normalized() {
    return ListSummariesQuery(scope: scope, page: page.normalized());
  }
}
