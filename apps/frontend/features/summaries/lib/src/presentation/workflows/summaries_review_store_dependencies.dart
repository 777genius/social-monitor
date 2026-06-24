import '../../application/use_cases/list_summaries_use_case.dart';
import '../../application/use_cases/load_summary_detail_use_case.dart';
import '../../application/use_cases/load_workspace_briefing_job_status_use_case.dart';
import '../../application/use_cases/load_workspace_briefing_use_case.dart';
import '../../application/use_cases/open_briefing_reader_source_use_case.dart';
import '../../application/use_cases/regenerate_summary_use_case.dart';
import '../../application/use_cases/request_workspace_briefing_use_case.dart';
import '../../application/use_cases/submit_briefing_reader_action_use_case.dart';
import '../../application/use_cases/submit_summary_feedback_use_case.dart';

final class SummariesReviewStoreDependencies {
  const SummariesReviewStoreDependencies({
    required this.listSummaries,
    required this.loadWorkspaceBriefing,
    required this.requestWorkspaceBriefing,
    required this.loadWorkspaceBriefingJobStatus,
    required this.loadSummaryDetail,
    required this.regenerateSummary,
    required this.submitFeedback,
    required this.submitBriefingReaderAction,
    required this.openBriefingReaderSource,
  });

  final ListSummariesUseCase listSummaries;
  final LoadWorkspaceBriefingUseCase loadWorkspaceBriefing;
  final RequestWorkspaceBriefingUseCase requestWorkspaceBriefing;
  final LoadWorkspaceBriefingJobStatusUseCase loadWorkspaceBriefingJobStatus;
  final LoadSummaryDetailUseCase loadSummaryDetail;
  final RegenerateSummaryUseCase regenerateSummary;
  final SubmitSummaryFeedbackUseCase submitFeedback;
  final SubmitBriefingReaderActionUseCase submitBriefingReaderAction;
  final OpenBriefingReaderSourceUseCase openBriefingReaderSource;
}
