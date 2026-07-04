import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/generated_summary.dart';
import '../../domain/entities/reader_summary_job_snapshot.dart';
import '../../domain/value_objects/reader_action_target.dart';
import '../commands/regenerate_summary_command.dart';
import '../commands/request_workspace_summary_command.dart';
import '../commands/submit_reader_action_command.dart';
import '../commands/submit_summary_feedback_command.dart';
import '../queries/list_summaries_query.dart';
import '../queries/load_summary_detail_query.dart';
import '../queries/load_workspace_summary_job_status_query.dart';
import '../queries/load_workspace_summary_query.dart';
import 'post_rating_catalog.dart';

abstract interface class SummaryReviewCatalog implements PostRatingCatalog {
  Future<Result<PageResult<GeneratedSummary>>> listSummaries(
    ListSummariesQuery query,
  );

  Future<Result<GeneratedSummary>> loadSummaryDetail(
    LoadSummaryDetailQuery query,
  );

  Future<Result<GeneratedSummary>> regenerateSummary(
    RegenerateSummaryCommand command,
  );

  Future<Result<GeneratedSummary>> submitFeedback(
    SubmitSummaryFeedbackCommand command,
  );

  Future<Result<ReaderActionResult>> submitReaderAction(
    SubmitReaderActionCommand command,
  );

  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummary(
    LoadWorkspaceSummaryQuery query,
  );

  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummaryHistory(
    LoadWorkspaceSummaryQuery query,
  );

  Future<Result<ReaderSummaryJobSnapshot>> requestWorkspaceSummary(
    RequestWorkspaceSummaryCommand command,
  );

  Future<Result<ReaderSummaryJobSnapshot>> loadWorkspaceSummaryJobStatus(
    LoadWorkspaceSummaryJobStatusQuery query,
  );
}
