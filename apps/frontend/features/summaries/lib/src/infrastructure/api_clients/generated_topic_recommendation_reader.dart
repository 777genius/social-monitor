import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/topic_recommendation_api_dto.dart';
import '../mappers/generated_topic_recommendation_rest_mapper.dart';
import 'summaries_api_client.dart';

final class GeneratedTopicRecommendationReader {
  const GeneratedTopicRecommendationReader({
    required generated.GeneratedApiRuntime runtime,
    GeneratedTopicRecommendationRestMapper mapper =
        const GeneratedTopicRecommendationRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedTopicRecommendationRestMapper _mapper;

  Future<Result<TopicRecommendationQueueApiDto>> load(
    LoadTopicRecommendationsApiRequest request,
  ) async {
    final result = await _runtime.client
        .send<generated.ListReaderSummaryTopicRecommendationsResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.readerSummaries
              .readerSummaryTopicRecommendationControllerList(
                xWorkspaceId: request.scope.workspaceId,
                xTenantId: request.scope.tenantId,
                scopeType: generated.ScopeType.workspace,
                windowDays: request.windowDays,
                limit: request.limit,
              ),
        );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.map(dto)),
      onFailure: Result<TopicRecommendationQueueApiDto>.failure,
    );
  }

  Future<Result<TopicRecommendationDecisionApiDto>> decide(
    DecideTopicRecommendationApiRequest request,
  ) async {
    final result = await _runtime.client
        .send<generated.DecideReaderSummaryTopicRecommendationResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.readerSummaries
              .readerSummaryTopicRecommendationControllerDecide(
                recommendationId: request.recommendationId,
                xWorkspaceId: request.scope.workspaceId,
                xTenantId: request.scope.tenantId,
                body:
                    generated.DecideReaderSummaryTopicRecommendationRequestDto(
                      action: _decisionAction(request.action),
                      interestIds: request.interestIds,
                      providerKeys: request.providerKeys,
                      topicLabel: request.topicLabel,
                      note: request.note,
                    ),
              ),
        );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.mapDecision(dto)),
      onFailure: Result<TopicRecommendationDecisionApiDto>.failure,
    );
  }
}

generated.DecideReaderSummaryTopicRecommendationRequestDtoActionAction
_decisionAction(String value) {
  return switch (value) {
    'accept' =>
      generated
          .DecideReaderSummaryTopicRecommendationRequestDtoActionAction
          .accept,
    'reject' =>
      generated
          .DecideReaderSummaryTopicRecommendationRequestDtoActionAction
          .reject,
    'undo' =>
      generated
          .DecideReaderSummaryTopicRecommendationRequestDtoActionAction
          .undo,
    _ =>
      generated
          .DecideReaderSummaryTopicRecommendationRequestDtoActionAction
          .reject,
  };
}
