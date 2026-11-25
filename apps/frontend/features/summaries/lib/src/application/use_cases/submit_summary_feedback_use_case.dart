import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/generated_summary.dart';
import '../../domain/value_objects/summary_feedback_kind.dart';
import '../commands/submit_summary_feedback_command.dart';
import '../contracts/summary_review_catalog.dart';

final class SubmitSummaryFeedbackUseCase {
  const SubmitSummaryFeedbackUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<GeneratedSummary>> call(SubmitSummaryFeedbackCommand command) {
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
    if (!command.summaryId.isValid) {
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
    if (command.kind == SummaryFeedbackKind.unknown) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Choose valid summary feedback',
            code: 'summaries.feedback_kind_invalid',
          ),
        ),
      );
    }
    return _catalog.submitFeedback(command);
  }
}
