import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/request_workspace_briefing_command.dart';
import '../../application/commands/submit_briefing_reader_action_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
import '../../application/queries/load_workspace_briefing_job_status_query.dart';
import '../../application/queries/load_workspace_briefing_query.dart';
import '../../domain/value_objects/briefing_reader_action_target.dart';
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

  Future<Result<BriefingReaderActionResult>> submitBriefingReaderAction(
    SubmitBriefingReaderActionApiRequest request,
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
    required this.userId,
    required this.idempotencyKey,
  });

  factory RequestWorkspaceBriefingApiRequest.fromCommand(
    RequestWorkspaceBriefingCommand command,
  ) {
    return RequestWorkspaceBriefingApiRequest(
      scope: command.scope,
      userId: command.userId,
      idempotencyKey: command.idempotencyKey,
    );
  }

  final WorkspaceScope scope;
  final String userId;
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

final class SubmitBriefingReaderActionApiRequest {
  const SubmitBriefingReaderActionApiRequest({
    required this.scope,
    required this.briefingId,
    required this.userId,
    required this.kind,
    required this.label,
    required this.target,
    required this.idempotencyKey,
    this.feedbackReason,
  });

  factory SubmitBriefingReaderActionApiRequest.fromCommand(
    SubmitBriefingReaderActionCommand command,
  ) {
    return SubmitBriefingReaderActionApiRequest(
      scope: command.scope,
      briefingId: command.briefingId,
      userId: command.userId,
      kind: command.kind,
      label: command.label,
      target: command.target,
      idempotencyKey: command.idempotencyKey,
      feedbackReason: command.feedbackReason,
    );
  }

  final WorkspaceScope scope;
  final String briefingId;
  final String userId;
  final String kind;
  final String label;
  final BriefingReaderActionTarget target;
  final String idempotencyKey;
  final BriefingReaderFeedbackReason? feedbackReason;
}
