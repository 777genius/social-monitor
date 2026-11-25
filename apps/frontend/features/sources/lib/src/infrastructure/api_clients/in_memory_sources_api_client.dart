import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_id.dart';
import '../api/source_health_api_dto.dart';
import '../api/source_mutation_api_dto.dart';
import '../api/source_summary_api_dto.dart';

abstract interface class SourcesApiClient {
  Future<Result<List<SourceSummaryApiDto>>> listSources(WorkspaceScope scope);

  Future<Result<SourceSummaryApiDto>> connectSource(
    ConnectSourceApiRequestDto request,
  );

  Future<Result<SourceSummaryApiDto>> reconnectSource(SourceId sourceId);

  Future<Result<SourceSummaryApiDto>> pauseSource(SourceId sourceId);

  Future<Result<SourceSummaryApiDto>> resumeSource(SourceId sourceId);

  Future<Result<SourceHealthApiDto>> loadSourceHealth(SourceId sourceId);
}

final class InMemorySourcesApiClient implements SourcesApiClient {
  InMemorySourcesApiClient({required List<SourceSummaryApiDto> items})
    : _items = List<SourceSummaryApiDto>.of(items);

  final List<SourceSummaryApiDto> _items;

  @override
  Future<Result<List<SourceSummaryApiDto>>> listSources(
    WorkspaceScope scope,
  ) async {
    if (!scope.isValid) {
      return Result.failure(
        const ApiProblem(
          title: 'Workspace required',
          status: 403,
          detail: 'A valid workspace is required to list sources',
        ).toFailure(),
      );
    }
    return Result.success(List<SourceSummaryApiDto>.unmodifiable(_items));
  }

  @override
  Future<Result<SourceSummaryApiDto>> connectSource(
    ConnectSourceApiRequestDto request,
  ) async {
    final created = SourceSummaryApiDto(
      id: _nextId(request.providerKey),
      name: request.displayName,
      credentialHealth: 'healthy',
      healthLabel: 'Healthy',
      capabilityKey: 'sources.${request.providerKey}',
      capabilityEnabled: true,
      collectionStatus: 'collecting',
    );
    _items.add(created);
    return Result.success(created);
  }

  @override
  Future<Result<SourceSummaryApiDto>> reconnectSource(SourceId sourceId) async {
    final index = _indexOf(sourceId);
    if (index == -1) return Result.failure(_notFoundFailure(sourceId));
    final current = _items[index];
    final repaired = SourceSummaryApiDto(
      id: current.id,
      name: current.name,
      credentialHealth: 'healthy',
      healthLabel: 'Healthy',
      capabilityKey: current.capabilityKey,
      capabilityEnabled: current.capabilityEnabled,
      collectionStatus: current.collectionStatus,
      capabilityDisabledReasonCode: current.capabilityDisabledReasonCode,
    );
    _items[index] = repaired;
    return Result.success(repaired);
  }

  @override
  Future<Result<SourceSummaryApiDto>> pauseSource(SourceId sourceId) async {
    final index = _indexOf(sourceId);
    if (index == -1) return Result.failure(_notFoundFailure(sourceId));
    final updated = _items[index].copyWith(collectionStatus: 'paused');
    _items[index] = updated;
    return Result.success(updated);
  }

  @override
  Future<Result<SourceSummaryApiDto>> resumeSource(SourceId sourceId) async {
    final index = _indexOf(sourceId);
    if (index == -1) return Result.failure(_notFoundFailure(sourceId));
    final updated = _items[index].copyWith(collectionStatus: 'collecting');
    _items[index] = updated;
    return Result.success(updated);
  }

  @override
  Future<Result<SourceHealthApiDto>> loadSourceHealth(SourceId sourceId) async {
    final index = _indexOf(sourceId);
    if (index == -1) return Result.failure(_notFoundFailure(sourceId));
    final source = _items[index];
    return Result.success(
      SourceHealthApiDto(
        sourceId: source.id,
        summary: source.healthLabel,
        checkedAtLabel: 'Just now',
        issueCount: source.credentialHealth == 'healthy' ? 0 : 1,
        providerPayloadPreview: source.credentialPreview,
      ),
    );
  }

  int _indexOf(SourceId sourceId) {
    return _items.indexWhere((item) => item.id == sourceId.value);
  }

  String _nextId(String providerKey) {
    final slug = providerKey
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '');
    return 'source-${slug.isEmpty ? 'provider' : slug}-${_items.length + 1}';
  }

  AppFailure _notFoundFailure(SourceId sourceId) {
    return ApiProblem(
      title: 'Source not found',
      status: 404,
      detail: 'Source ${sourceId.value} is not available',
    ).toFailure();
  }
}
