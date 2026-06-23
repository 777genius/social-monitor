import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/feed_item_id.dart';

final class LoadFeedItemQuery {
  const LoadFeedItemQuery({required this.scope, required this.feedItemId});

  final WorkspaceScope scope;
  final FeedItemId feedItemId;
}
