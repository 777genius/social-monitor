import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/reader_action_target.dart';
import '../api/summary_api_dto.dart';
import 'summaries_api_client.dart';

final class InMemorySummariesApiClient implements SummariesApiClient {
  InMemorySummariesApiClient({
    required List<SummaryApiDto> items,
    ReaderSummaryApiDto? workspaceSummary,
  }) : _items = List<SummaryApiDto>.of(items),
       _workspaceSummary = workspaceSummary;

  final List<SummaryApiDto> _items;
  final ReaderSummaryApiDto? _workspaceSummary;
  final Map<String, ReaderSummaryJobApiDto> _summaryJobs = {};
  final List<LoadWorkspaceSummaryApiRequest> loadWorkspaceSummaryRequests = [];
  final List<RequestWorkspaceSummaryApiRequest>
  requestWorkspaceSummaryRequests = [];
  final List<ReaderActionResult> submittedReaderActions = [];
  final List<SubmitReaderActionApiRequest> submittedReaderActionRequests = [];

  @override
  Future<Result<SummaryPageApiDto>> listSummaries(
    ListSummariesApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }

    final offset = int.tryParse(request.cursor ?? '') ?? 0;
    final start = offset.clamp(0, _items.length);
    final end = (start + request.limit).clamp(0, _items.length);
    return Result.success(
      SummaryPageApiDto(
        items: _items.sublist(start, end),
        nextCursor: end < _items.length ? '$end' : null,
      ),
    );
  }

  @override
  Future<Result<SummaryApiDto>> loadSummaryDetail(
    LoadSummaryDetailApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    return _findSummary(request.summaryId);
  }

  @override
  Future<Result<WorkspaceSummaryApiDto>> loadWorkspaceSummary(
    LoadWorkspaceSummaryApiRequest request,
  ) async {
    loadWorkspaceSummaryRequests.add(request);
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    return Result.success(WorkspaceSummaryApiDto(current: _workspaceSummary));
  }

  @override
  Future<Result<ReaderSummaryJobApiDto>> requestWorkspaceSummary(
    RequestWorkspaceSummaryApiRequest request,
  ) async {
    requestWorkspaceSummaryRequests.add(request);
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    final job = ReaderSummaryJobApiDto(
      id: 'summary-job-${request.idempotencyKey.hashCode.abs()}',
      status: 'requested',
      created: true,
      requestedAt: DateTime.now(),
      period: SummaryPeriodApiDto(
        cadence: request.period.cadence.name,
        startedAt: request.period.startedAt,
        endedAt: request.period.endedAt,
        timezone: request.period.timezone,
        periodKey: request.period.periodKey,
      ),
    );
    _summaryJobs[job.id] = job;
    return Result.success(job);
  }

  @override
  Future<Result<ReaderSummaryJobApiDto>> loadWorkspaceSummaryJobStatus(
    LoadWorkspaceSummaryJobStatusApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    final current = _summaryJobs[request.summaryJobId];
    if (current == null) {
      return Result.failure(
        NotFoundFailure(
          message: 'Summary job ${request.summaryJobId} is not available',
          code: 'summaries.summary_job_not_found',
        ),
      );
    }

    final completed = ReaderSummaryJobApiDto(
      id: current.id,
      status: _workspaceSummary == null ? 'no_signal' : 'completed',
      created: current.created,
      summaryId: _workspaceSummary?.id,
      requestedAt: current.requestedAt,
      startedAt: current.startedAt ?? DateTime.now(),
      completedAt: DateTime.now(),
      period: current.period,
    );
    _summaryJobs[current.id] = completed;
    return Result.success(completed);
  }

  @override
  Future<Result<SummaryApiDto>> regenerateSummary(
    RegenerateSummaryApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    final result = _findSummary(request.summaryId);
    return result.fold(
      onSuccess: (summary) {
        final updated = _replaceSummary(
          summary,
          status: 'ready',
          freshnessLabel: 'Regenerated just now',
        );
        return Result.success(updated);
      },
      onFailure: Result<SummaryApiDto>.failure,
    );
  }

  @override
  Future<Result<SummaryApiDto>> submitFeedback(
    SubmitSummaryFeedbackApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    final result = _findSummary(request.summaryId);
    return result.fold(
      onSuccess: (summary) {
        final updated = _replaceSummary(summary, feedbackSubmitted: true);
        return Result.success(updated);
      },
      onFailure: Result<SummaryApiDto>.failure,
    );
  }

  @override
  Future<Result<ReaderActionResult>> submitReaderAction(
    SubmitReaderActionApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    final result = ReaderActionResult(
      actionId: 'reader-action-${request.idempotencyKey.hashCode.abs()}',
      idempotencyKey: request.idempotencyKey,
      kind: request.kind,
      created: true,
      learningDirection: request.kind == 'mark_relevant'
          ? 'positive'
          : 'negative',
    );
    submittedReaderActionRequests.add(request);
    submittedReaderActions.add(result);
    return Result.success(result);
  }

  AppFailure? _workspaceFailure(WorkspaceScope scope) {
    if (scope.isValid) {
      return null;
    }
    return const ForbiddenFailure(
      message: 'A valid workspace is required to review summaries',
      code: 'summaries.workspace_required',
    );
  }

  Result<SummaryApiDto> _findSummary(String summaryId) {
    for (final item in _items) {
      if (item.id == summaryId) {
        return Result.success(item);
      }
    }
    return Result.failure(
      NotFoundFailure(
        message: 'Summary $summaryId is not available',
        code: 'summaries.not_found',
      ),
    );
  }

  SummaryApiDto _replaceSummary(
    SummaryApiDto summary, {
    String? status,
    String? freshnessLabel,
    bool? feedbackSubmitted,
  }) {
    final index = _items.indexWhere((item) => item.id == summary.id);
    final updated = SummaryApiDto(
      id: summary.id,
      title: summary.title,
      status: status ?? summary.status,
      bodyText: summary.bodyText,
      citations: summary.citations,
      freshnessLabel: freshnessLabel ?? summary.freshnessLabel,
      feedbackSubmitted: feedbackSubmitted ?? summary.feedbackSubmitted,
    );
    if (index != -1) {
      _items[index] = updated;
    }
    return updated;
  }
}
