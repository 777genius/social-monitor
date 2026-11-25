import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/generated_summary.dart';
import '../contracts/summary_review_catalog.dart';
import '../queries/load_summary_detail_query.dart';

final class LoadSummaryDetailUseCase {
  const LoadSummaryDetailUseCase(this._catalog);

  final SummaryReviewCatalog _catalog;

  Future<Result<GeneratedSummary>> call(LoadSummaryDetailQuery query) {
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
    if (!query.summaryId.isValid) {
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
    return _catalog.loadSummaryDetail(query);
  }
}
