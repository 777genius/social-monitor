import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/topic_summary.dart';
import '../contracts/topic_catalog.dart';
import '../queries/list_topics_query.dart';

final class ListTopicsUseCase {
  const ListTopicsUseCase(this._catalog);

  final TopicCatalog _catalog;

  Future<Result<PageResult<TopicSummary>>> call(ListTopicsQuery query) async {
    final normalized = query.normalized();
    if (!normalized.scope.isValid) {
      return const Result.failure(
        ValidationFailure(
          message: 'Workspace scope is required to list topics',
          code: 'topics.workspace_scope_required',
        ),
      );
    }

    return _catalog.listTopics(normalized);
  }
}
