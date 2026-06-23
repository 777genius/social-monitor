import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/feed_filter.dart';

final class ListFeedMentionsQuery {
  const ListFeedMentionsQuery({
    required this.scope,
    this.page = const PageRequest(),
    this.filter = const FeedFilter(),
  });

  final WorkspaceScope scope;
  final PageRequest page;
  final FeedFilter filter;

  ListFeedMentionsQuery normalized() {
    return ListFeedMentionsQuery(
      scope: scope,
      page: page.normalized(),
      filter: filter.normalized(),
    );
  }
}
