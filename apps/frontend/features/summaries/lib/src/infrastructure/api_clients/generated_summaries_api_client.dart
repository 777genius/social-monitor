import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/reader_action_target.dart';
import '../../domain/value_objects/summary_feedback_kind.dart';
import '../../domain/value_objects/summary_period.dart';
import '../api/summary_api_dto.dart';
import '../mappers/generated_summary_rest_mapper.dart';
import 'generated_workspace_summary_reader.dart';
import 'summaries_api_client.dart';

final class GeneratedSummariesApiClient implements SummariesApiClient {
  GeneratedSummariesApiClient({
    required generated.GeneratedApiRuntime runtime,
    GeneratedSummaryRestMapper mapper = const GeneratedSummaryRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  factory GeneratedSummariesApiClient.fromRuntime({
    required Object runtime,
    GeneratedSummaryRestMapper mapper = const GeneratedSummaryRestMapper(),
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedSummariesApiClient(runtime: runtime, mapper: mapper);
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedSummaryRestMapper _mapper;

  @override
  Future<Result<SummaryPageApiDto>> listSummaries(
    ListSummariesApiRequest request,
  ) async {
    final result = await _runtime.client
        .send<generated.ListSummariesResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.summaries.summaryControllerList(
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
            cursor: request.cursor,
            limit: request.limit,
          ),
        );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.list(dto)),
      onFailure: Result<SummaryPageApiDto>.failure,
    );
  }

  @override
  Future<Result<SummaryApiDto>> loadSummaryDetail(
    LoadSummaryDetailApiRequest request,
  ) {
    return _loadSummaryDetail(
      scope: request.scope,
      summaryId: request.summaryId,
    );
  }

  @override
  Future<Result<WorkspaceSummaryApiDto>> loadWorkspaceSummary(
    LoadWorkspaceSummaryApiRequest request,
  ) => GeneratedWorkspaceSummaryReader(
    runtime: _runtime,
    mapper: _mapper,
  ).load(request);

  @override
  Future<Result<ReaderSummaryJobApiDto>> requestWorkspaceSummary(
    RequestWorkspaceSummaryApiRequest request,
  ) async {
    final result = await _runtime.client
        .send<generated.RequestReaderSummaryResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.readerSummaries
              .readerSummaryRequestControllerCreate(
                idempotencyKey: request.idempotencyKey,
                xWorkspaceId: request.scope.workspaceId,
                xTenantId: request.scope.tenantId,
                body: generated.RequestReaderSummaryRequestDto(
                  userId: request.userId,
                  cadence: _requestCadence(request.period.cadence),
                  period: _requestPeriod(request.period),
                  timezone: request.period.timezone,
                  scope: const generated.ReaderSummaryScopeDto(
                    type: generated.ReaderSummaryScopeDtoTypeType.workspace,
                  ),
                ),
              ),
        );
    return result.fold(
      onSuccess: (dto) =>
          Result.success(_mapper.requestedReaderSummaryJob(dto)),
      onFailure: Result<ReaderSummaryJobApiDto>.failure,
    );
  }

  generated.RequestReaderSummaryRequestDtoCadenceCadence _requestCadence(
    SummaryPeriodCadence cadence,
  ) {
    return switch (cadence) {
      SummaryPeriodCadence.daily =>
        generated.RequestReaderSummaryRequestDtoCadenceCadence.daily,
      SummaryPeriodCadence.weekly =>
        generated.RequestReaderSummaryRequestDtoCadenceCadence.weekly,
      SummaryPeriodCadence.monthly =>
        generated.RequestReaderSummaryRequestDtoCadenceCadence.monthly,
      SummaryPeriodCadence.custom =>
        generated.RequestReaderSummaryRequestDtoCadenceCadence.custom,
      SummaryPeriodCadence.unknown =>
        generated.RequestReaderSummaryRequestDtoCadenceCadence.$unknown,
    };
  }

  generated.RequestReaderSummaryPeriodDto _requestPeriod(SummaryPeriod period) {
    return generated.RequestReaderSummaryPeriodDto(
      startedAt: period.startedAt.toUtc(),
      endedAt: period.endedAt.toUtc(),
      timezone: period.timezone,
    );
  }

  @override
  Future<Result<ReaderSummaryJobApiDto>> loadWorkspaceSummaryJobStatus(
    LoadWorkspaceSummaryJobStatusApiRequest request,
  ) async {
    final result = await _runtime.client
        .send<generated.ReaderSummaryJobStatusResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () =>
              _runtime.rest.readerSummaries.readerSummaryJobControllerGetStatus(
                readerSummaryJobId: request.summaryJobId,
                xWorkspaceId: request.scope.workspaceId,
                xTenantId: request.scope.tenantId,
              ),
        );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.readerSummaryJobStatus(dto)),
      onFailure: Result<ReaderSummaryJobApiDto>.failure,
    );
  }

  @override
  Future<Result<SummaryApiDto>> regenerateSummary(
    RegenerateSummaryApiRequest request,
  ) async {
    final result = await _runtime.client
        .send<generated.RegenerateSummaryResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.summaries.summaryControllerRegenerate(
            summaryId: request.summaryId,
            idempotencyKey:
                '${request.scope.workspaceId}:${request.summaryId}:regenerate',
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
          ),
        );
    return result.fold(
      onSuccess: (job) => _loadSummaryDetail(
        scope: request.scope,
        summaryId: request.summaryId,
        status: _statusFromJob(job.status),
      ),
      onFailure: (failure) =>
          Future.value(Result<SummaryApiDto>.failure(failure)),
    );
  }

  @override
  Future<Result<SummaryApiDto>> submitFeedback(
    SubmitSummaryFeedbackApiRequest request,
  ) async {
    final result = await _runtime.client
        .send<generated.RecordSummaryFeedbackResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.summaries.summaryFeedbackControllerCreate(
            summaryId: request.summaryId,
            idempotencyKey:
                '${request.scope.workspaceId}:${request.summaryId}:${request.kind.name}',
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
            body: generated.RecordSummaryFeedbackRequestDto(
              category: _feedbackCategory(request.kind),
              rating: _feedbackRating(request.kind),
              comment: _feedbackComment(request.kind),
            ),
          ),
        );
    return result.fold(
      onSuccess: (_) => _loadSummaryDetail(
        scope: request.scope,
        summaryId: request.summaryId,
        feedbackSubmitted: true,
      ),
      onFailure: (failure) =>
          Future.value(Result<SummaryApiDto>.failure(failure)),
    );
  }

  @override
  Future<Result<ReaderActionResult>> submitReaderAction(
    SubmitReaderActionApiRequest request,
  ) async {
    final relevanceAction = _readerActionToRelevanceAction(request.kind);
    if (relevanceAction == null) {
      return Result.failure(
        ValidationFailure(
          message: 'Reader action ${request.kind} is not supported yet',
          code: 'summaries.reader_action_not_supported',
          field: 'kind',
        ),
      );
    }

    final result = await _runtime.client
        .send<generated.RecordRelevanceFeedbackResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.relevance.relevanceControllerFeedback(
            userId: request.userId,
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
            body: generated.RecordRelevanceFeedbackRequestDto(
              idempotencyKey: request.idempotencyKey,
              action: relevanceAction,
              rating: request.kind == 'mark_relevant' ? 5 : 2,
              feedItemId: null,
              interestId: request.target.interestId,
              providerKey: request.target.providerKey,
              title: request.target.title,
              bodyPreview: request.target.bodyPreview,
              canonicalUrl: request.target.canonicalUrl,
              reason: _feedbackReason(request.feedbackReason),
            ),
          ),
        );
    return result.fold(
      onSuccess: (dto) => Result.success(
        ReaderActionResult(
          actionId: dto.feedback.feedbackId,
          idempotencyKey: request.idempotencyKey,
          kind: request.kind,
          created: dto.created,
          learningDirection: dto.learningDirection.json ?? 'unknown',
        ),
      ),
      onFailure: Result<ReaderActionResult>.failure,
    );
  }

  Future<Result<SummaryApiDto>> _loadSummaryDetail({
    required WorkspaceScope scope,
    required String summaryId,
    String? status,
    bool feedbackSubmitted = false,
  }) async {
    final result = await _runtime.client.send<generated.SummaryResponseDto>(
      generated.WorkspaceRequest(scope: scope),
      () => _runtime.rest.summaries.summaryControllerGet(
        summaryId: summaryId,
        xWorkspaceId: scope.workspaceId,
        xTenantId: scope.tenantId,
      ),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(
        _mapper.detail(
          dto,
          status: status,
          feedbackSubmitted: feedbackSubmitted,
        ),
      ),
      onFailure: Result<SummaryApiDto>.failure,
    );
  }

  String _statusFromJob(
    generated.RegenerateSummaryResponseDtoStatusStatus status,
  ) {
    return switch (status) {
      generated.RegenerateSummaryResponseDtoStatusStatus.requested ||
      generated.RegenerateSummaryResponseDtoStatusStatus.running =>
        'generating',
      generated.RegenerateSummaryResponseDtoStatusStatus.failed => 'failed',
      generated.RegenerateSummaryResponseDtoStatusStatus.completed ||
      generated.RegenerateSummaryResponseDtoStatusStatus.noSignal => 'ready',
      generated.RegenerateSummaryResponseDtoStatusStatus.$unknown => 'unknown',
    };
  }

  generated.RecordSummaryFeedbackRequestDtoCategoryCategory _feedbackCategory(
    SummaryFeedbackKind kind,
  ) {
    return switch (kind) {
      SummaryFeedbackKind.helpful =>
        generated.RecordSummaryFeedbackRequestDtoCategoryCategory.other,
      SummaryFeedbackKind.needsWork =>
        generated.RecordSummaryFeedbackRequestDtoCategoryCategory.lowRelevance,
      SummaryFeedbackKind.unknown =>
        generated.RecordSummaryFeedbackRequestDtoCategoryCategory.other,
    };
  }

  int _feedbackRating(SummaryFeedbackKind kind) {
    return switch (kind) {
      SummaryFeedbackKind.helpful => 5,
      SummaryFeedbackKind.needsWork => 2,
      SummaryFeedbackKind.unknown => 3,
    };
  }

  String _feedbackComment(SummaryFeedbackKind kind) {
    return switch (kind) {
      SummaryFeedbackKind.helpful => 'Marked helpful in frontend review',
      SummaryFeedbackKind.needsWork =>
        'Marked as needs work in frontend review',
      SummaryFeedbackKind.unknown => 'Marked from frontend review',
    };
  }

  generated.RecordRelevanceFeedbackRequestDtoActionAction?
  _readerActionToRelevanceAction(String kind) {
    return switch (kind) {
      'mark_relevant' =>
        generated.RecordRelevanceFeedbackRequestDtoActionAction.moreLikeThis,
      'mark_not_relevant' =>
        generated.RecordRelevanceFeedbackRequestDtoActionAction.lessLikeThis,
      _ => null,
    };
  }

  generated.RecordRelevanceFeedbackRequestDtoReasonReason? _feedbackReason(
    ReaderFeedbackReason? reason,
  ) {
    return switch (reason) {
      ReaderFeedbackReason.notSameStory =>
        generated.RecordRelevanceFeedbackRequestDtoReasonReason.notSameStory,
      ReaderFeedbackReason.duplicate =>
        generated.RecordRelevanceFeedbackRequestDtoReasonReason.duplicate,
      ReaderFeedbackReason.lowQualitySource =>
        generated
            .RecordRelevanceFeedbackRequestDtoReasonReason
            .lowQualitySource,
      ReaderFeedbackReason.overratedProvider =>
        generated
            .RecordRelevanceFeedbackRequestDtoReasonReason
            .overratedProvider,
      null => null,
    };
  }
}
