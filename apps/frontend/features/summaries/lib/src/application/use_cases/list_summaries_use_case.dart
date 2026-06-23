import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/generated_summary.dart';
import '../contracts/summary_review_catalog.dart';
import '../queries/list_summaries_query.dart';

final class ListSummariesUseCase {
  const ListSummariesUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<PageResult<GeneratedSummary>>> call(ListSummariesQuery query) {
    final normalized = query.normalized();
    if (!normalized.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'summaries.workspace_scope_required',
          ),
        ),
      );
    }
    return _catalog.listSummaries(normalized);
  }
}
