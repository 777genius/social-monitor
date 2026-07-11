import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/summary_api_dto.dart';
import 'summaries_api_client.dart';

final class InMemoryPublishedSummaryReader {
  const InMemoryPublishedSummaryReader({
    required ReaderSummaryApiDto? workspaceSummary,
    required AppFailure? Function(WorkspaceScope scope) workspaceFailure,
  }) : _workspaceSummary = workspaceSummary,
       _workspaceFailure = workspaceFailure;

  final ReaderSummaryApiDto? _workspaceSummary;
  final AppFailure? Function(WorkspaceScope scope) _workspaceFailure;

  Future<Result<WorkspaceSummaryApiDto>> load(
    LoadPublishedSummaryApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    final summary = _workspaceSummary;
    if (summary == null || summary.id != request.summaryId) {
      return Result.failure(
        NotFoundFailure(
          message: 'Published summary ${request.summaryId} is not available',
          code: 'summaries.published_summary_not_found',
        ),
      );
    }
    return Result.success(
      WorkspaceSummaryApiDto(
        current: summary,
        availablePeriods: [summary.period],
      ),
    );
  }
}
