import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/topic_summary.dart';
import '../commands/archive_topic_command.dart';
import '../contracts/topic_catalog.dart';

final class ArchiveTopicUseCase {
  const ArchiveTopicUseCase(this._catalog);

  final TopicCatalog _catalog;

  Future<Result<TopicSummary>> call(ArchiveTopicCommand command) {
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
    return _catalog.archiveTopic(command);
  }
}
