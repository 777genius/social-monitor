import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/summary_api_dto.dart';
import '../mappers/generated_summary_rest_mapper.dart';
import 'summaries_api_client.dart';

final class GeneratedSummaryListReader {
  const GeneratedSummaryListReader({
    required generated.GeneratedApiRuntime runtime,
    required GeneratedSummaryRestMapper mapper,
  }) : _runtime = runtime,
       _mapper = mapper;

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedSummaryRestMapper _mapper;

  Future<Result<SummaryPageApiDto>> load(
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
}
