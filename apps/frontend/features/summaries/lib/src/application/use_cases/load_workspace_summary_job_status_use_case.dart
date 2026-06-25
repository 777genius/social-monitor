import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/reader_summary_job_snapshot.dart';
import '../contracts/summary_review_catalog.dart';
import '../queries/load_workspace_summary_job_status_query.dart';

final class LoadWorkspaceSummaryJobStatusUseCase {
  const LoadWorkspaceSummaryJobStatusUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<ReaderSummaryJobSnapshot>> call(
    LoadWorkspaceSummaryJobStatusQuery query,
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
    if (query.summaryJobId.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Summary job id is required',
            code: 'summaries.summary_job_required',
          ),
        ),
      );
    }

    return _catalog.loadWorkspaceSummaryJobStatus(query);
  }
}
