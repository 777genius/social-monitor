import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/feed_item.dart';
import '../queries/list_feed_items_query.dart';
import '../queries/load_feed_item_query.dart';

abstract interface class FeedItemCatalog {
  Future<Result<PageResult<FeedItem>>> listFeedItems(ListFeedItemsQuery query);

  Future<Result<FeedItem>> loadFeedItem(LoadFeedItemQuery query);
}
