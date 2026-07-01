import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/request_workspace_summary_command.dart';
import '../../application/commands/submit_reader_action_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/contracts/summary_review_catalog.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
import '../../application/queries/load_workspace_summary_job_status_query.dart';
import '../../application/queries/load_workspace_summary_query.dart';
import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/generated_summary.dart';
import '../../domain/entities/reader_summary_job_snapshot.dart';
import '../../domain/value_objects/reader_action_target.dart';
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
  Future<Result<ReaderActionResult>> submitReaderAction(
    SubmitReaderActionCommand command,
  ) {
    return _apiClient.submitReaderAction(
      SubmitReaderActionApiRequest.fromCommand(command),
    );
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummary(
    LoadWorkspaceSummaryQuery query,
  ) async {
    final result = await _apiClient.loadWorkspaceSummary(
      LoadWorkspaceSummaryApiRequest.fromQuery(query),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(
        WorkspaceSummarySnapshot(
          current: dto.current == null
              ? null
              : _mapper.readerSummaryToDomain(dto.current!),
          availablePeriods: dto.availablePeriods
              .map(_mapper.summaryPeriodToDomain)
              .toList(growable: false),
        ),
      ),
      onFailure: Result<WorkspaceSummarySnapshot>.failure,
    );
  }

  @override
  Future<Result<ReaderSummaryJobSnapshot>> requestWorkspaceSummary(
    RequestWorkspaceSummaryCommand command,
  ) async {
    final result = await _apiClient.requestWorkspaceSummary(
      RequestWorkspaceSummaryApiRequest.fromCommand(command),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.summaryJobToDomain(dto)),
      onFailure: Result<ReaderSummaryJobSnapshot>.failure,
    );
  }

  @override
  Future<Result<ReaderSummaryJobSnapshot>> loadWorkspaceSummaryJobStatus(
    LoadWorkspaceSummaryJobStatusQuery query,
  ) async {
    final result = await _apiClient.loadWorkspaceSummaryJobStatus(
      LoadWorkspaceSummaryJobStatusApiRequest.fromQuery(query),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.summaryJobToDomain(dto)),
      onFailure: Result<ReaderSummaryJobSnapshot>.failure,
    );
  }

  Result<GeneratedSummary> _mapSummary(Result<SummaryApiDto> result) {
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<GeneratedSummary>.failure,
    );
  }
}
