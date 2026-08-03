import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/weekly_summary_projection.dart';
import '../contracts/weekly_summary_projection_catalog.dart';
import '../queries/load_weekly_summary_projection_query.dart';

final class LoadWeeklySummaryProjectionUseCase {
  const LoadWeeklySummaryProjectionUseCase(this._catalog);

  final WeeklySummaryProjectionCatalog _catalog;

  Future<Result<WeeklySummaryProjection>> call(
    LoadWeeklySummaryProjectionQuery query,
  ) async {
    if (!query.scope.isValid) {
      return const Result.failure(
        ValidationFailure(
          message: 'Workspace scope is required',
          code: 'summaries.weekly_workspace_scope_required',
        ),
      );
    }
    final result = await _catalog.loadWeeklyProjection(query);
    return result.fold(
      onSuccess: (projection) {
        if (projection.scope != query.scope || projection.week != query.week) {
          return const Result.failure(
            ValidationFailure(
              message: 'Weekly summary response did not match its request.',
              code: 'summaries.weekly_returned_scope_or_week_mismatch',
            ),
          );
        }
        return Result.success(projection);
      },
      onFailure: Result<WeeklySummaryProjection>.failure,
    );
  }
}
