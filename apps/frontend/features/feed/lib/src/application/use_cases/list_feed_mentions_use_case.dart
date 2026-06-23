import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/feed_mention.dart';
import '../contracts/feed_review_catalog.dart';
import '../queries/list_feed_mentions_query.dart';

final class ListFeedMentionsUseCase {
  const ListFeedMentionsUseCase(this._catalog);

  final FeedReviewCatalog _catalog;

  Future<Result<PageResult<FeedMention>>> call(ListFeedMentionsQuery query) {
    final normalized = query.normalized();
    if (!normalized.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'feed.workspace_scope_required',
          ),
        ),
      );
    }
    return _catalog.listMentions(normalized);
  }
}
