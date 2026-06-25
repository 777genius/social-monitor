import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/request_workspace_summary_command.dart';
import '../../application/commands/submit_reader_action_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
import '../../application/queries/load_workspace_summary_job_status_query.dart';
import '../../application/queries/load_workspace_summary_query.dart';
import '../../domain/value_objects/reader_action_target.dart';
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

  Future<Result<ReaderActionResult>> submitReaderAction(
    SubmitReaderActionApiRequest request,
  );

  Future<Result<WorkspaceSummaryApiDto>> loadWorkspaceSummary(
    LoadWorkspaceSummaryApiRequest request,
  );

  Future<Result<ReaderSummaryJobApiDto>> requestWorkspaceSummary(
    RequestWorkspaceSummaryApiRequest request,
  );

  Future<Result<ReaderSummaryJobApiDto>> loadWorkspaceSummaryJobStatus(
    LoadWorkspaceSummaryJobStatusApiRequest request,
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

final class LoadWorkspaceSummaryApiRequest {
  const LoadWorkspaceSummaryApiRequest({required this.scope});

  factory LoadWorkspaceSummaryApiRequest.fromQuery(
    LoadWorkspaceSummaryQuery query,
  ) {
    return LoadWorkspaceSummaryApiRequest(scope: query.scope);
  }

  final WorkspaceScope scope;
}

final class RequestWorkspaceSummaryApiRequest {
  const RequestWorkspaceSummaryApiRequest({
    required this.scope,
    required this.userId,
    required this.idempotencyKey,
  });

  factory RequestWorkspaceSummaryApiRequest.fromCommand(
    RequestWorkspaceSummaryCommand command,
  ) {
    return RequestWorkspaceSummaryApiRequest(
      scope: command.scope,
      userId: command.userId,
      idempotencyKey: command.idempotencyKey,
    );
  }

  final WorkspaceScope scope;
  final String userId;
  final String idempotencyKey;
}

final class LoadWorkspaceSummaryJobStatusApiRequest {
  const LoadWorkspaceSummaryJobStatusApiRequest({
    required this.scope,
    required this.summaryJobId,
  });

  factory LoadWorkspaceSummaryJobStatusApiRequest.fromQuery(
    LoadWorkspaceSummaryJobStatusQuery query,
  ) {
    return LoadWorkspaceSummaryJobStatusApiRequest(
      scope: query.scope,
      summaryJobId: query.summaryJobId,
    );
  }

  final WorkspaceScope scope;
  final String summaryJobId;
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

final class SubmitReaderActionApiRequest {
  const SubmitReaderActionApiRequest({
    required this.scope,
    required this.summaryId,
    required this.userId,
    required this.kind,
    required this.label,
    required this.target,
    required this.idempotencyKey,
    this.feedbackReason,
  });

  factory SubmitReaderActionApiRequest.fromCommand(
    SubmitReaderActionCommand command,
  ) {
    return SubmitReaderActionApiRequest(
      scope: command.scope,
      summaryId: command.summaryId,
      userId: command.userId,
      kind: command.kind,
      label: command.label,
      target: command.target,
      idempotencyKey: command.idempotencyKey,
      feedbackReason: command.feedbackReason,
    );
  }

  final WorkspaceScope scope;
  final String summaryId;
  final String userId;
  final String kind;
  final String label;
  final ReaderActionTarget target;
  final String idempotencyKey;
  final ReaderFeedbackReason? feedbackReason;
}
