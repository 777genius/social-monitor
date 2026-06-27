import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../contracts/summary_review_catalog.dart';
import '../queries/load_workspace_summary_query.dart';

final class LoadWorkspaceSummaryUseCase {
  const LoadWorkspaceSummaryUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<WorkspaceSummarySnapshot>> call(
    LoadWorkspaceSummaryQuery query,
  ) {
    if (!query.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'summaries.workspace_scope_required',
          ),
        ),
      );
    }
    if (!query.period.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Summary period is invalid',
            code: 'summaries.summary_period_invalid',
            field: 'period',
          ),
        ),
      );
    }
    return _catalog.loadWorkspaceSummary(query);
  }
}
