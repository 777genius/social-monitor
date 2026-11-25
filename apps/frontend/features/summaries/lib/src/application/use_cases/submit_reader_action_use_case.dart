import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/reader_action_target.dart';
import '../commands/submit_reader_action_command.dart';
import '../contracts/summary_review_catalog.dart';

final class SubmitReaderActionUseCase {
  const SubmitReaderActionUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<ReaderActionResult>> call(SubmitReaderActionCommand command) {
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
    if (command.summaryId.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Summary id is required',
            code: 'summaries.summary_id_required',
            field: 'summaryId',
          ),
        ),
      );
    }
    if (command.userId.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Reader feedback requires a user id',
            code: 'summaries.reader_action_user_required',
            field: 'userId',
          ),
        ),
      );
    }
    if (!supportedReaderFeedbackActionKinds.contains(command.kind)) {
      return Future.value(
        Result.failure(
          ValidationFailure(
            message: 'Reader action ${command.kind} is not supported yet',
            code: 'summaries.reader_action_not_supported',
            field: 'kind',
          ),
        ),
      );
    }
    if (!command.target.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Reader action target is incomplete',
            code: 'summaries.reader_action_target_required',
            field: 'target',
          ),
        ),
      );
    }
    if (command.kind == 'mark_not_relevant' && command.feedbackReason == null) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Reader negative feedback reason is required',
            code: 'summaries.reader_action_feedback_reason_required',
            field: 'feedbackReason',
          ),
        ),
      );
    }
    if (command.idempotencyKey.trim().isEmpty) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Reader action idempotency key is required',
            code: 'summaries.reader_action_idempotency_required',
            field: 'idempotencyKey',
          ),
        ),
      );
    }

    return _catalog.submitReaderAction(command);
  }
}
