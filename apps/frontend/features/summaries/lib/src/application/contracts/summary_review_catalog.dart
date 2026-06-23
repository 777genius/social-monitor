import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/generated_summary.dart';
import '../commands/regenerate_summary_command.dart';
import '../commands/submit_summary_feedback_command.dart';
import '../queries/list_summaries_query.dart';
import '../queries/load_summary_detail_query.dart';

abstract interface class SummaryReviewCatalog {
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
}
