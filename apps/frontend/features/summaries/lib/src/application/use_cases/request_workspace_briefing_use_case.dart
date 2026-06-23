import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/briefing_job_snapshot.dart';
import '../commands/request_workspace_briefing_command.dart';
import '../contracts/summary_review_catalog.dart';

final class RequestWorkspaceBriefingUseCase {
  const RequestWorkspaceBriefingUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<BriefingJobSnapshot>> call(
    RequestWorkspaceBriefingCommand command,
  ) {
    if (!command.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'summaries.workspace_scope_required',
          ),
        ),
      );
    }
    if (command.idempotencyKey.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Briefing request idempotency key is required',
            code: 'summaries.briefing_idempotency_required',
          ),
        ),
      );
    }

    return _catalog.requestWorkspaceBriefing(command);
  }
}
