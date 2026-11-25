import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/feed_item.dart';
import '../contracts/feed_item_catalog.dart';
import '../queries/load_feed_item_query.dart';

final class LoadFeedItemUseCase {
  const LoadFeedItemUseCase(this._catalog);

  final FeedItemCatalog _catalog;

  Future<Result<FeedItem>> call(LoadFeedItemQuery query) {
    return _catalog.loadFeedItem(query);
  }
}
