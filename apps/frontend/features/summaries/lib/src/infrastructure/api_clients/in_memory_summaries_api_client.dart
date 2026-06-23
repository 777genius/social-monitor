import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/request_workspace_briefing_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
import '../../application/queries/load_workspace_briefing_job_status_query.dart';
import '../../application/queries/load_workspace_briefing_query.dart';
import '../../domain/value_objects/summary_feedback_kind.dart';
import '../api/summary_api_dto.dart';

abstract interface class SummariesApiClient {
  Future<Result<SummaryPageApiDto>> listSummaries(
    ListSummariesApiRequest request,
  );

  Future<Result<SummaryApiDto>> loadSummaryDetail(
    LoadSummaryDetailApiRequest request,
  );

  Future<Result<SummaryApiDto>> regenerateSummary(
    RegenerateSummaryApiRequest request,
  );

  Future<Result<SummaryApiDto>> submitFeedback(
    SubmitSummaryFeedbackApiRequest request,
  );

  Future<Result<WorkspaceBriefingApiDto>> loadWorkspaceBriefing(
    LoadWorkspaceBriefingApiRequest request,
  );

  Future<Result<BriefingJobApiDto>> requestWorkspaceBriefing(
    RequestWorkspaceBriefingApiRequest request,
  );

  Future<Result<BriefingJobApiDto>> loadWorkspaceBriefingJobStatus(
    LoadWorkspaceBriefingJobStatusApiRequest request,
  );
}

final class ListSummariesApiRequest {
  const ListSummariesApiRequest({
    required this.scope,
    required this.cursor,
    required this.limit,
  });

  factory ListSummariesApiRequest.fromQuery(ListSummariesQuery query) {
    final normalized = query.normalized();
    return ListSummariesApiRequest(
      scope: normalized.scope,
      cursor: normalized.page.cursor,
      limit: normalized.page.limit,
    );
  }

  final WorkspaceScope scope;
  final String? cursor;
  final int limit;
}

final class LoadSummaryDetailApiRequest {
  const LoadSummaryDetailApiRequest({
    required this.scope,
    required this.summaryId,
  });

  factory LoadSummaryDetailApiRequest.fromQuery(LoadSummaryDetailQuery query) {
    return LoadSummaryDetailApiRequest(
      scope: query.scope,
      summaryId: query.summaryId.value,
    );
  }

  final WorkspaceScope scope;
  final String summaryId;
}

final class LoadWorkspaceBriefingApiRequest {
  const LoadWorkspaceBriefingApiRequest({required this.scope});

  factory LoadWorkspaceBriefingApiRequest.fromQuery(
    LoadWorkspaceBriefingQuery query,
  ) {
    return LoadWorkspaceBriefingApiRequest(scope: query.scope);
  }

  final WorkspaceScope scope;
}

final class RequestWorkspaceBriefingApiRequest {
  const RequestWorkspaceBriefingApiRequest({
    required this.scope,
    required this.idempotencyKey,
  });

  factory RequestWorkspaceBriefingApiRequest.fromCommand(
    RequestWorkspaceBriefingCommand command,
  ) {
    return RequestWorkspaceBriefingApiRequest(
      scope: command.scope,
      idempotencyKey: command.idempotencyKey,
    );
  }

  final WorkspaceScope scope;
  final String idempotencyKey;
}

final class LoadWorkspaceBriefingJobStatusApiRequest {
  const LoadWorkspaceBriefingJobStatusApiRequest({
    required this.scope,
    required this.briefingJobId,
  });

  factory LoadWorkspaceBriefingJobStatusApiRequest.fromQuery(
    LoadWorkspaceBriefingJobStatusQuery query,
  ) {
    return LoadWorkspaceBriefingJobStatusApiRequest(
      scope: query.scope,
      briefingJobId: query.briefingJobId,
    );
  }

  final WorkspaceScope scope;
  final String briefingJobId;
}

final class RegenerateSummaryApiRequest {
  const RegenerateSummaryApiRequest({
    required this.scope,
    required this.summaryId,
  });

  factory RegenerateSummaryApiRequest.fromCommand(
    RegenerateSummaryCommand command,
  ) {
    return RegenerateSummaryApiRequest(
      scope: command.scope,
      summaryId: command.summaryId.value,
    );
  }

  final WorkspaceScope scope;
  final String summaryId;
}

final class SubmitSummaryFeedbackApiRequest {
  const SubmitSummaryFeedbackApiRequest({
    required this.scope,
    required this.summaryId,
    required this.kind,
  });

  factory SubmitSummaryFeedbackApiRequest.fromCommand(
    SubmitSummaryFeedbackCommand command,
  ) {
    return SubmitSummaryFeedbackApiRequest(
      scope: command.scope,
      summaryId: command.summaryId.value,
      kind: command.kind,
    );
  }

  final WorkspaceScope scope;
  final String summaryId;
  final SummaryFeedbackKind kind;
}

final class InMemorySummariesApiClient implements SummariesApiClient {
  InMemorySummariesApiClient({
    required List<SummaryApiDto> items,
    BriefingApiDto? workspaceBriefing,
  }) : _items = List<SummaryApiDto>.of(items),
       _workspaceBriefing = workspaceBriefing;

  final List<SummaryApiDto> _items;
  final BriefingApiDto? _workspaceBriefing;
  final Map<String, BriefingJobApiDto> _briefingJobs = {};

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
  Future<Result<WorkspaceBriefingApiDto>> loadWorkspaceBriefing(
    LoadWorkspaceBriefingApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    return Result.success(WorkspaceBriefingApiDto(current: _workspaceBriefing));
  }

  @override
  Future<Result<BriefingJobApiDto>> requestWorkspaceBriefing(
    RequestWorkspaceBriefingApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    final job = BriefingJobApiDto(
      id: 'briefing-job-${request.idempotencyKey.hashCode.abs()}',
      status: 'requested',
      created: true,
      requestedAt: DateTime.now(),
    );
    _briefingJobs[job.id] = job;
    return Result.success(job);
  }

  @override
  Future<Result<BriefingJobApiDto>> loadWorkspaceBriefingJobStatus(
    LoadWorkspaceBriefingJobStatusApiRequest request,
  ) async {
    final failure = _workspaceFailure(request.scope);
    if (failure != null) {
      return Result.failure(failure);
    }
    final current = _briefingJobs[request.briefingJobId];
    if (current == null) {
      return Result.failure(
        NotFoundFailure(
          message: 'Briefing job ${request.briefingJobId} is not available',
          code: 'summaries.briefing_job_not_found',
        ),
      );
    }

    final completed = BriefingJobApiDto(
      id: current.id,
      status: _workspaceBriefing == null ? 'no_signal' : 'completed',
      created: current.created,
      briefingId: _workspaceBriefing?.id,
      requestedAt: current.requestedAt,
      startedAt: current.startedAt ?? DateTime.now(),
      completedAt: DateTime.now(),
    );
    _briefingJobs[current.id] = completed;
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
