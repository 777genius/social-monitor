import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/briefing_job_snapshot.dart';
import '../contracts/summary_review_catalog.dart';
import '../queries/load_workspace_briefing_job_status_query.dart';

final class LoadWorkspaceBriefingJobStatusUseCase {
  const LoadWorkspaceBriefingJobStatusUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<BriefingJobSnapshot>> call(
    LoadWorkspaceBriefingJobStatusQuery query,
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
    if (query.briefingJobId.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Briefing job id is required',
            code: 'summaries.briefing_job_required',
          ),
        ),
      );
    }

    return _catalog.loadWorkspaceBriefingJobStatus(query);
  }
}
