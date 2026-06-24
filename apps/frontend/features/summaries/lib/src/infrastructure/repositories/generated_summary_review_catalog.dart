import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/request_workspace_briefing_command.dart';
import '../../application/commands/submit_briefing_reader_action_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/contracts/summary_review_catalog.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
import '../../application/queries/load_workspace_briefing_job_status_query.dart';
import '../../application/queries/load_workspace_briefing_query.dart';
import '../../domain/entities/briefing_job_snapshot.dart';
import '../../domain/entities/generated_briefing.dart';
import '../../domain/entities/generated_summary.dart';
import '../../domain/value_objects/briefing_reader_action_target.dart';
import '../api/summary_api_dto.dart';
import '../api_clients/summaries_api_client.dart';
import '../mappers/summary_mapper.dart';

final class GeneratedSummaryReviewCatalog implements SummaryReviewCatalog {
  const GeneratedSummaryReviewCatalog({
    required SummariesApiClient apiClient,
    SummaryMapper mapper = const SummaryMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper;

  final SummariesApiClient _apiClient;
  final SummaryMapper _mapper;

  @override
  Future<Result<PageResult<GeneratedSummary>>> listSummaries(
    ListSummariesQuery query,
  ) async {
    final normalized = query.normalized();
    final result = await _apiClient.listSummaries(
      ListSummariesApiRequest.fromQuery(normalized),
    );
    return result.fold(
      onSuccess: (page) => Result.success(
        PageResult<GeneratedSummary>(
          items: page.items.map(_mapper.toDomain).toList(growable: false),
          request: normalized.page,
          nextCursor: page.nextCursor,
        ),
      ),
      onFailure: Result<PageResult<GeneratedSummary>>.failure,
    );
  }

  @override
  Future<Result<GeneratedSummary>> loadSummaryDetail(
    LoadSummaryDetailQuery query,
  ) async {
    final result = await _apiClient.loadSummaryDetail(
      LoadSummaryDetailApiRequest.fromQuery(query),
    );
    return _mapSummary(result);
  }

  @override
  Future<Result<GeneratedSummary>> regenerateSummary(
    RegenerateSummaryCommand command,
  ) async {
    final result = await _apiClient.regenerateSummary(
      RegenerateSummaryApiRequest.fromCommand(command),
    );
    return _mapSummary(result);
  }

  @override
  Future<Result<GeneratedSummary>> submitFeedback(
    SubmitSummaryFeedbackCommand command,
  ) async {
    final result = await _apiClient.submitFeedback(
      SubmitSummaryFeedbackApiRequest.fromCommand(command),
    );
    return _mapSummary(result);
  }

  @override
  Future<Result<BriefingReaderActionResult>> submitBriefingReaderAction(
    SubmitBriefingReaderActionCommand command,
  ) {
    return _apiClient.submitBriefingReaderAction(
      SubmitBriefingReaderActionApiRequest.fromCommand(command),
    );
  }

  @override
  Future<Result<WorkspaceBriefingSnapshot>> loadWorkspaceBriefing(
    LoadWorkspaceBriefingQuery query,
  ) async {
    final result = await _apiClient.loadWorkspaceBriefing(
      LoadWorkspaceBriefingApiRequest.fromQuery(query),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(
        WorkspaceBriefingSnapshot(
          current: dto.current == null
              ? null
              : _mapper.briefingToDomain(dto.current!),
        ),
      ),
      onFailure: Result<WorkspaceBriefingSnapshot>.failure,
    );
  }

  @override
  Future<Result<BriefingJobSnapshot>> requestWorkspaceBriefing(
    RequestWorkspaceBriefingCommand command,
  ) async {
    final result = await _apiClient.requestWorkspaceBriefing(
      RequestWorkspaceBriefingApiRequest.fromCommand(command),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.briefingJobToDomain(dto)),
      onFailure: Result<BriefingJobSnapshot>.failure,
    );
  }

  @override
  Future<Result<BriefingJobSnapshot>> loadWorkspaceBriefingJobStatus(
    LoadWorkspaceBriefingJobStatusQuery query,
  ) async {
    final result = await _apiClient.loadWorkspaceBriefingJobStatus(
      LoadWorkspaceBriefingJobStatusApiRequest.fromQuery(query),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.briefingJobToDomain(dto)),
      onFailure: Result<BriefingJobSnapshot>.failure,
    );
  }

  Result<GeneratedSummary> _mapSummary(Result<SummaryApiDto> result) {
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<GeneratedSummary>.failure,
    );
  }
}
