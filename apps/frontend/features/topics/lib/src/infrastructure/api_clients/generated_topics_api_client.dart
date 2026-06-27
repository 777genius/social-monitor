import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/topic_mutation_api_dto.dart';
import '../api/topic_summary_api_dto.dart';
import '../mappers/generated_topic_rest_mapper.dart';
import 'in_memory_topics_api_client.dart';

final class GeneratedTopicsApiClient implements TopicsApiClient {
  GeneratedTopicsApiClient({
    required generated.GeneratedApiRuntime runtime,
    GeneratedTopicRestMapper mapper = const GeneratedTopicRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  factory GeneratedTopicsApiClient.fromRuntime({
    required Object runtime,
    GeneratedTopicRestMapper mapper = const GeneratedTopicRestMapper(),
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedTopicsApiClient(runtime: runtime, mapper: mapper);
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedTopicRestMapper _mapper;

  @override
  Future<Result<ListTopicsApiResponseDto>> listTopics(
    ListTopicsApiRequest request,
  ) async {
    final result = await _runtime.client.send<generated.ListTopicsResponseDto>(
      generated.WorkspaceRequest(scope: request.scope),
      () {
        return _runtime.rest.topics.topicControllerList(
          xWorkspaceId: request.scope.workspaceId,
          xTenantId: request.scope.tenantId,
          cursor: request.page.cursor,
          limit: request.page.limit,
        );
      },
    );

    return result.fold(
      onSuccess: (dto) {
        final response = _mapper.listTopics(dto);
        return Result.success(_filterLocally(response, request.search));
      },
      onFailure: Result<ListTopicsApiResponseDto>.failure,
    );
  }

  @override
  Future<Result<TopicSummaryApiDto>> createTopic(
    CreateTopicApiRequestDto request,
  ) async {
    final scope = request.scope;
    final result = await _runtime.client.send<generated.CreateTopicResponseDto>(
      generated.WorkspaceRequest(scope: scope),
      () {
        return _runtime.rest.topics.topicControllerCreate(
          idempotencyKey: request.idempotencyKey,
          xWorkspaceId: scope.workspaceId,
          xTenantId: scope.tenantId,
          body: _mapper.createTopic(request),
        );
      },
    );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.createdTopic(dto, request)),
      onFailure: Result<TopicSummaryApiDto>.failure,
    );
  }

  @override
  Future<Result<TopicSummaryApiDto>> updateTopic(
    UpdateTopicApiRequestDto request,
  ) async {
    final scope = request.scope;
    final result = await _runtime.client.send<generated.TopicResponseDto>(
      generated.WorkspaceRequest(scope: scope),
      () {
        return _runtime.rest.topics.topicControllerUpdate(
          topicId: request.id,
          xWorkspaceId: scope.workspaceId,
          xTenantId: scope.tenantId,
          body: _mapper.updateTopic(request),
        );
      },
    );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.topic(dto)),
      onFailure: Result<TopicSummaryApiDto>.failure,
    );
  }

  @override
  Future<Result<TopicSummaryApiDto>> archiveTopic(
    ArchiveTopicApiRequestDto request,
  ) async {
    final scope = request.scope;
    final result = await _runtime.client.send<generated.TopicResponseDto>(
      generated.WorkspaceRequest(scope: scope),
      () {
        return _runtime.rest.topics.topicControllerArchive(
          topicId: request.id,
          xWorkspaceId: scope.workspaceId,
          xTenantId: scope.tenantId,
        );
      },
    );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.topic(dto)),
      onFailure: Result<TopicSummaryApiDto>.failure,
    );
  }

  ListTopicsApiResponseDto _filterLocally(
    ListTopicsApiResponseDto response,
    String search,
  ) {
    final normalized = search.trim().toLowerCase();
    if (normalized.isEmpty) {
      return response;
    }
    return ListTopicsApiResponseDto(
      items: response.items
          .where((item) {
            return (item.name ?? '').toLowerCase().contains(normalized) ||
                (item.query ?? '').toLowerCase().contains(normalized);
          })
          .toList(growable: false),
      nextCursor: response.nextCursor,
      isPartial: response.nextCursor != null,
    );
  }
}
