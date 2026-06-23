import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/source_binding_api_dto.dart';
import '../api/source_binding_health_api_dto.dart';
import 'source_bindings_api_client.dart';

final class InMemorySourceBindingsApiClient implements SourceBindingsApiClient {
  InMemorySourceBindingsApiClient({required List<SourceBindingApiDto> items})
    : _items = List<SourceBindingApiDto>.of(items);

  final List<SourceBindingApiDto> _items;

  @override
  Future<Result<ListSourceBindingsApiResponseDto>> listSourceBindings(
    SourceBindingListApiRequestDto request,
  ) async {
    if (!request.scope.isValid) {
      return Result.failure(_workspaceFailure());
    }
    final items = _items
        .where((item) => item.topicId == request.topicId)
        .toList(growable: false);
    return Result.success(ListSourceBindingsApiResponseDto(items: items));
  }

  @override
  Future<Result<SourceBindingApiDto>> bindSource(
    BindSourceApiRequestDto request,
  ) async {
    if (!request.scope.isValid) {
      return Result.failure(_workspaceFailure());
    }
    final created = SourceBindingApiDto(
      id: 'binding-${request.providerKey}-${_items.length + 1}',
      topicId: request.topicId,
      providerKey: request.providerKey,
      capabilityProfileVersion: 1,
      status: 'enabled',
      configPreview: request.config,
      createdAt: DateTime.utc(2026, 6, 23, 12, _items.length),
    );
    _items.add(created);
    return Result.success(created);
  }

  @override
  Future<Result<SourceBindingApiDto>> changeSourceBindingStatus(
    ChangeSourceBindingStatusApiRequestDto request,
  ) async {
    final index = _indexOf(request.sourceBindingId);
    if (index == -1) {
      return Result.failure(_notFoundFailure(request.sourceBindingId));
    }
    final updated = _items[index].copyWith(status: request.status);
    _items[index] = updated;
    return Result.success(updated);
  }

  @override
  Future<Result<SourceBindingHealthApiDto>> loadSourceBindingHealth(
    SourceBindingHealthApiRequestDto request,
  ) async {
    final index = _indexOf(request.sourceBindingId);
    if (index == -1) {
      return Result.failure(_notFoundFailure(request.sourceBindingId));
    }
    final binding = _items[index];
    return Result.success(
      SourceBindingHealthApiDto(
        sourceBinding: binding,
        healthState: binding.status == 'paused' ? 'paused' : 'healthy',
        operatorAction: binding.status == 'paused'
            ? 'Resume this binding to collect content.'
            : 'All systems operational.',
        evaluatedAt: DateTime.utc(2026, 6, 23, 12, 5),
        freshness: const SourceBindingFreshnessApiDto(
          isFresh: true,
          ageSeconds: 120,
        ),
        latestScan: const SourceBindingScanSummaryApiDto(
          scanJobId: 'scan-demo',
          status: 'succeeded',
          userState: 'content_current',
          operatorAction: 'No action needed.',
          fetched: 128,
          inserted: 96,
          skippedDuplicates: 12,
          projected: 96,
        ),
      ),
    );
  }

  int _indexOf(String id) {
    return _items.indexWhere((item) => item.id == id);
  }

  AppFailure _workspaceFailure() {
    return const ApiProblem(
      title: 'Workspace required',
      status: 403,
      detail: 'A valid workspace is required for source bindings',
    ).toFailure();
  }

  AppFailure _notFoundFailure(String id) {
    return ApiProblem(
      title: 'Source binding not found',
      status: 404,
      detail: 'Source binding $id is not available',
    ).toFailure();
  }
}
