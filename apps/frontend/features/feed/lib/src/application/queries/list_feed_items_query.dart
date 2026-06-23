import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/feed_item_filter.dart';

final class ListFeedItemsQuery {
  const ListFeedItemsQuery({
    required this.scope,
    this.page = const PageRequest(limit: 20),
    this.filter = const FeedItemFilter(),
  });

  final WorkspaceScope scope;
  final PageRequest page;
  final FeedItemFilter filter;

  ListFeedItemsQuery normalized() {
    return ListFeedItemsQuery(
      scope: scope,
      page: page.normalized(),
      filter: filter.normalized(),
    );
  }
}
