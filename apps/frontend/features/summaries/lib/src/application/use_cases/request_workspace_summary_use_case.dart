import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/reader_summary_job_snapshot.dart';
import '../commands/request_workspace_summary_command.dart';
import '../contracts/summary_review_catalog.dart';

final class RequestWorkspaceSummaryUseCase {
  const RequestWorkspaceSummaryUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<ReaderSummaryJobSnapshot>> call(
    RequestWorkspaceSummaryCommand command,
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
    if (command.userId.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Summary request requires a user id',
            code: 'summaries.user_scope_required',
            field: 'userId',
          ),
        ),
      );
    }
    if (command.idempotencyKey.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Summary request idempotency key is required',
            code: 'summaries.summary_idempotency_required',
          ),
        ),
      );
    }
    if (!command.period.isValid) {
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

    return _catalog.requestWorkspaceSummary(command);
  }
}
