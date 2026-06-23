import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/topic_summary.dart';
import '../commands/update_topic_command.dart';
import '../contracts/topic_catalog.dart';

final class UpdateTopicUseCase {
  const UpdateTopicUseCase(this._catalog);

  final TopicCatalog _catalog;

  Future<Result<TopicSummary>> call(UpdateTopicCommand command) {
    if (!command.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'topics.workspace_scope_required',
          ),
        ),
      );
    }
    if (!command.topicId.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Topic id is required',
            code: 'topics.id_required',
            field: 'topicId',
          ),
        ),
      );
    }
    if (!command.name.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Topic name must contain at least two characters',
            code: 'topics.name_invalid',
            field: 'name',
          ),
        ),
      );
    }
    if (!command.rules.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Add at least one keyword before saving the topic',
            code: 'topics.rules_invalid',
            field: 'keywords',
          ),
        ),
      );
    }
    return _catalog.updateTopic(command);
  }
}
