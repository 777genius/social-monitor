import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/feed_mention.dart';
import '../commands/triage_mention_command.dart';
import '../queries/list_feed_mentions_query.dart';

abstract interface class FeedReviewCatalog {
  Future<Result<PageResult<FeedMention>>> listMentions(
    ListFeedMentionsQuery query,
  );

  Future<Result<FeedMention>> triageMention(TriageMentionCommand command);
}
