import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/feed_item.dart';
import '../contracts/feed_item_catalog.dart';
import '../queries/list_feed_items_query.dart';

final class ListFeedItemsUseCase {
  const ListFeedItemsUseCase(this._catalog);

  final FeedItemCatalog _catalog;

  Future<Result<PageResult<FeedItem>>> call(ListFeedItemsQuery query) {
    return _catalog.listFeedItems(query);
  }
}
