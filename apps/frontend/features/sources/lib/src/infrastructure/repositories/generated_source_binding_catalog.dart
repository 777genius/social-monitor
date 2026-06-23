import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/bind_source_to_topic_command.dart';
import '../../application/commands/change_source_binding_status_command.dart';
import '../../application/contracts/source_binding_catalog.dart';
import '../../application/queries/list_source_bindings_query.dart';
import '../../application/queries/load_source_binding_health_query.dart';
import '../../domain/entities/source_binding.dart';
import '../../domain/entities/source_binding_health_snapshot.dart';
import '../api/source_binding_api_dto.dart';
import '../api_clients/source_bindings_api_client.dart';
import '../mappers/source_binding_mapper.dart';

final class GeneratedSourceBindingCatalog implements SourceBindingCatalog {
  const GeneratedSourceBindingCatalog({
    required SourceBindingsApiClient apiClient,
    SourceBindingMapper mapper = const SourceBindingMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper;

  final SourceBindingsApiClient _apiClient;
  final SourceBindingMapper _mapper;

  @override
  Future<Result<PageResult<SourceBinding>>> listSourceBindings(
    ListSourceBindingsQuery query,
  ) async {
    final result = await _apiClient.listSourceBindings(
      SourceBindingListApiRequestDto(
        scope: query.scope,
        topicId: query.topicId.value,
        page: query.page,
      ),
    );
    return result.fold(
      onSuccess: (response) => Result.success(
        PageResult<SourceBinding>(
          items: response.items.map(_mapper.toDomain).toList(growable: false),
          request: query.page,
          nextCursor: response.nextCursor,
        ),
      ),
      onFailure: Result<PageResult<SourceBinding>>.failure,
    );
  }

  @override
  Future<Result<SourceBinding>> bindSourceToTopic(
    BindSourceToTopicCommand command,
  ) async {
    final result = await _apiClient.bindSource(
      BindSourceApiRequestDto(
        scope: command.scope,
        topicId: command.topicId.value,
        providerKey: command.providerKey.value,
        config: command.config,
        idempotencyKey: command.idempotencyKey,
      ),
    );
    return _mapBindingResult(result);
  }

  @override
  Future<Result<SourceBinding>> changeSourceBindingStatus(
    ChangeSourceBindingStatusCommand command,
  ) async {
    final result = await _apiClient.changeSourceBindingStatus(
      ChangeSourceBindingStatusApiRequestDto(
        scope: command.scope,
        topicId: command.topicId.value,
        sourceBindingId: command.sourceBindingId.value,
        status: command.status.name,
        idempotencyKey: command.idempotencyKey,
      ),
    );
    return _mapBindingResult(result);
  }

  @override
  Future<Result<SourceBindingHealthSnapshot>> loadSourceBindingHealth(
    LoadSourceBindingHealthQuery query,
  ) async {
    final result = await _apiClient.loadSourceBindingHealth(
      SourceBindingHealthApiRequestDto(
        scope: query.scope,
        topicId: query.topicId.value,
        sourceBindingId: query.sourceBindingId.value,
      ),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.healthToDomain(dto)),
      onFailure: Result<SourceBindingHealthSnapshot>.failure,
    );
  }

  Result<SourceBinding> _mapBindingResult(Result<SourceBindingApiDto> result) {
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<SourceBinding>.failure,
    );
  }
}
