import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/archive_topic_command.dart';
import '../../application/commands/create_topic_command.dart';
import '../../application/commands/update_topic_command.dart';
import '../../application/contracts/topic_catalog.dart';
import '../../application/queries/list_topics_query.dart';
import '../../domain/entities/topic_summary.dart';
import '../api/topic_summary_api_dto.dart';
import '../api_clients/in_memory_topics_api_client.dart';
import '../mappers/topic_mutation_mapper.dart';
import '../mappers/topic_summary_mapper.dart';

final class GeneratedTopicCatalog implements TopicCatalog {
  const GeneratedTopicCatalog({
    required TopicsApiClient apiClient,
    TopicSummaryMapper mapper = const TopicSummaryMapper(),
    TopicMutationMapper mutationMapper = const TopicMutationMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper,
       _mutationMapper = mutationMapper;

  final TopicsApiClient _apiClient;
  final TopicSummaryMapper _mapper;
  final TopicMutationMapper _mutationMapper;

  @override
  Future<Result<PageResult<TopicSummary>>> listTopics(
    ListTopicsQuery query,
  ) async {
    final result = await _apiClient.listTopics(
      ListTopicsApiRequest.fromQuery(query),
    );

    return result.fold(
      onSuccess: (response) {
        final page = PageResult<TopicSummary>(
          items: response.items.map(_mapper.toDomain).toList(growable: false),
          request: query.page,
          nextCursor: response.nextCursor,
          isPartial: response.isPartial,
        );
        return Result.success(page);
      },
      onFailure: Result<PageResult<TopicSummary>>.failure,
    );
  }

  @override
  Future<Result<TopicSummary>> createTopic(CreateTopicCommand command) async {
    final result = await _apiClient.createTopic(
      _mutationMapper.createRequest(command),
    );
    return _mapTopicResult(result);
  }

  @override
  Future<Result<TopicSummary>> updateTopic(UpdateTopicCommand command) async {
    final result = await _apiClient.updateTopic(
      _mutationMapper.updateRequest(command),
    );
    return _mapTopicResult(result);
  }

  @override
  Future<Result<TopicSummary>> archiveTopic(ArchiveTopicCommand command) async {
    final result = await _apiClient.archiveTopic(
      _mutationMapper.archiveRequest(command),
    );
    return _mapTopicResult(result);
  }

  Result<TopicSummary> _mapTopicResult(Result<TopicSummaryApiDto> result) {
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<TopicSummary>.failure,
    );
  }
}
