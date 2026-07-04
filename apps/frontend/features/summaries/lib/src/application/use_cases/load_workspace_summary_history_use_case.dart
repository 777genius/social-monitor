import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../contracts/summary_review_catalog.dart';
import '../queries/load_workspace_summary_query.dart';

final class LoadWorkspaceSummaryHistoryUseCase {
  const LoadWorkspaceSummaryHistoryUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<WorkspaceSummarySnapshot>> call(
    LoadWorkspaceSummaryQuery query,
  ) {
    if (!query.scope.isValid) {
      return Future.value(
        const Result.failure(
          ForbiddenFailure(
            message: 'A valid workspace is required to load summary history',
            code: 'summaries.workspace_scope_required',
          ),
        ),
      );
    }
    return _catalog.loadWorkspaceSummaryHistory(query);
  }
}
