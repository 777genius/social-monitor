import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
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
  InMemorySummariesApiClient({required List<SummaryApiDto> items})
    : _items = List<SummaryApiDto>.of(items);

  final List<SummaryApiDto> _items;

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
    return const ApiProblem(
      title: 'Workspace required',
      status: 403,
      detail: 'A valid workspace is required to review summaries',
    ).toFailure();
  }

  Result<SummaryApiDto> _findSummary(String summaryId) {
    for (final item in _items) {
      if (item.id == summaryId) {
        return Result.success(item);
      }
    }
    return Result.failure(
      ApiProblem(
        title: 'Summary not found',
        status: 404,
        detail: 'Summary $summaryId is not available',
      ).toFailure(),
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
