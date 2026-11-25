import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/feed_mention.dart';
import '../../domain/value_objects/mention_triage_state.dart';
import '../commands/triage_mention_command.dart';
import '../contracts/feed_review_catalog.dart';

final class TriageMentionUseCase {
  const TriageMentionUseCase(this._catalog);

  final FeedReviewCatalog _catalog;

  Future<Result<FeedMention>> call(TriageMentionCommand command) {
    if (!command.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'feed.workspace_scope_required',
          ),
        ),
      );
    }
    if (!command.mentionId.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Mention id is required',
            code: 'feed.mention_id_required',
            field: 'mentionId',
          ),
        ),
      );
    }
    if (command.nextState == MentionTriageState.unknown) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Choose a valid triage state',
            code: 'feed.triage_state_invalid',
          ),
        ),
      );
    }
    return _catalog.triageMention(command);
  }
}
