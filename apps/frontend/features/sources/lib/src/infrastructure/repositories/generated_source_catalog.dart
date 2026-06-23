import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/connect_source_command.dart';
import '../../application/commands/pause_source_command.dart';
import '../../application/commands/reconnect_source_command.dart';
import '../../application/commands/resume_source_command.dart';
import '../../application/contracts/source_catalog.dart';
import '../../application/queries/list_sources_query.dart';
import '../../application/queries/load_source_health_query.dart';
import '../../domain/entities/source_health_snapshot.dart';
import '../../domain/entities/source_summary.dart';
import '../api/source_health_api_dto.dart';
import '../api/source_summary_api_dto.dart';
import '../api_clients/in_memory_sources_api_client.dart';
import '../mappers/source_health_mapper.dart';
import '../mappers/source_mutation_mapper.dart';
import '../mappers/source_summary_mapper.dart';

final class GeneratedSourceCatalog implements SourceCatalog {
  const GeneratedSourceCatalog({
    required SourcesApiClient apiClient,
    SourceSummaryMapper mapper = const SourceSummaryMapper(),
    SourceMutationMapper mutationMapper = const SourceMutationMapper(),
    SourceHealthMapper healthMapper = const SourceHealthMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper,
       _mutationMapper = mutationMapper,
       _healthMapper = healthMapper;

  final SourcesApiClient _apiClient;
  final SourceSummaryMapper _mapper;
  final SourceMutationMapper _mutationMapper;
  final SourceHealthMapper _healthMapper;

  @override
  Future<Result<PageResult<SourceSummary>>> listSources(
    ListSourcesQuery query,
  ) async {
    final result = await _apiClient.listSources(query.scope);
    return result.fold(
      onSuccess: (items) => Result.success(
        PageResult<SourceSummary>(
          items: items.map(_mapper.toDomain).toList(growable: false),
          request: const PageRequest(),
        ),
      ),
      onFailure: Result<PageResult<SourceSummary>>.failure,
    );
  }

  @override
  Future<Result<SourceSummary>> connectSource(
    ConnectSourceCommand command,
  ) async {
    final result = await _apiClient.connectSource(
      _mutationMapper.connectRequest(command),
    );
    return _mapSourceResult(result);
  }

  @override
  Future<Result<SourceSummary>> reconnectSource(
    ReconnectSourceCommand command,
  ) async {
    final result = await _apiClient.reconnectSource(command.sourceId);
    return _mapSourceResult(result);
  }

  @override
  Future<Result<SourceSummary>> pauseSource(PauseSourceCommand command) async {
    final result = await _apiClient.pauseSource(command.sourceId);
    return _mapSourceResult(result);
  }

  @override
  Future<Result<SourceSummary>> resumeSource(
    ResumeSourceCommand command,
  ) async {
    final result = await _apiClient.resumeSource(command.sourceId);
    return _mapSourceResult(result);
  }

  @override
  Future<Result<SourceHealthSnapshot>> loadSourceHealth(
    LoadSourceHealthQuery query,
  ) async {
    final result = await _apiClient.loadSourceHealth(query.sourceId);
    return _mapHealthResult(result);
  }

  Result<SourceSummary> _mapSourceResult(Result<SourceSummaryApiDto> result) {
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<SourceSummary>.failure,
    );
  }

  Result<SourceHealthSnapshot> _mapHealthResult(
    Result<SourceHealthApiDto> result,
  ) {
    return result.fold(
      onSuccess: (dto) => Result.success(_healthMapper.toDomain(dto)),
      onFailure: Result<SourceHealthSnapshot>.failure,
    );
  }
}
