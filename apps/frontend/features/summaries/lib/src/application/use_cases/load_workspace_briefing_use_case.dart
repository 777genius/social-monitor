import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/generated_briefing.dart';
import '../contracts/summary_review_catalog.dart';
import '../queries/load_workspace_briefing_query.dart';

final class LoadWorkspaceBriefingUseCase {
  const LoadWorkspaceBriefingUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<WorkspaceBriefingSnapshot>> call(
    LoadWorkspaceBriefingQuery query,
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
    return _catalog.loadWorkspaceBriefing(query);
  }
}
