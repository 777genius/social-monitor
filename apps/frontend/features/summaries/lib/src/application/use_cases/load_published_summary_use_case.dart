import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../contracts/summary_review_catalog.dart';
import '../queries/load_published_summary_query.dart';

final class LoadPublishedSummaryUseCase {
  const LoadPublishedSummaryUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<WorkspaceSummarySnapshot>> call(
    LoadPublishedSummaryQuery query,
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
    if (query.summaryId.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Published summary id is required',
            code: 'summaries.published_summary_id_required',
            field: 'summaryId',
          ),
        ),
      );
    }
    return _catalog.loadPublishedSummary(query);
  }
}
