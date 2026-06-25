import '../../application/use_cases/list_summaries_use_case.dart';
import '../../application/use_cases/load_summary_detail_use_case.dart';
import '../../application/use_cases/load_workspace_summary_job_status_use_case.dart';
import '../../application/use_cases/load_workspace_summary_use_case.dart';
import '../../application/use_cases/open_reader_source_use_case.dart';
import '../../application/use_cases/regenerate_summary_use_case.dart';
import '../../application/use_cases/request_workspace_summary_use_case.dart';
import '../../application/use_cases/submit_reader_action_use_case.dart';
import '../../application/use_cases/submit_summary_feedback_use_case.dart';

final class SummariesReviewStoreDependencies {
  const SummariesReviewStoreDependencies({
    required this.listSummaries,
    required this.loadWorkspaceSummary,
    required this.requestWorkspaceSummary,
    required this.loadWorkspaceSummaryJobStatus,
    required this.loadSummaryDetail,
    required this.regenerateSummary,
    required this.submitFeedback,
    required this.submitReaderAction,
    required this.openReaderSource,
  });

  final ListSummariesUseCase listSummaries;
  final LoadWorkspaceSummaryUseCase loadWorkspaceSummary;
  final RequestWorkspaceSummaryUseCase requestWorkspaceSummary;
  final LoadWorkspaceSummaryJobStatusUseCase loadWorkspaceSummaryJobStatus;
  final LoadSummaryDetailUseCase loadSummaryDetail;
  final RegenerateSummaryUseCase regenerateSummary;
  final SubmitSummaryFeedbackUseCase submitFeedback;
  final SubmitReaderActionUseCase submitReaderAction;
  final OpenReaderSourceUseCase openReaderSource;
}
