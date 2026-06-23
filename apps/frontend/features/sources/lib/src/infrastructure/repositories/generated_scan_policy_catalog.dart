import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/set_scan_policy_command.dart';
import '../../application/contracts/scan_policy_catalog.dart';
import '../../application/queries/load_scan_policy_query.dart';
import '../../domain/entities/scan_policy.dart';
import '../api/scan_policy_api_dto.dart';
import '../api_clients/scan_policies_api_client.dart';
import '../mappers/scan_policy_mapper.dart';

final class GeneratedScanPolicyCatalog implements ScanPolicyCatalog {
  const GeneratedScanPolicyCatalog({
    required ScanPoliciesApiClient apiClient,
    ScanPolicyMapper mapper = const ScanPolicyMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper;

  final ScanPoliciesApiClient _apiClient;
  final ScanPolicyMapper _mapper;

  @override
  Future<Result<ScanPolicy>> loadScanPolicy(LoadScanPolicyQuery query) async {
    final result = await _apiClient.loadScanPolicy(
      ScanPolicyApiRequestDto(
        scope: query.scope,
        sourceBindingId: query.sourceBindingId.value,
      ),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<ScanPolicy>.failure,
    );
  }

  @override
  Future<Result<ScanPolicy>> setScanPolicy(SetScanPolicyCommand command) async {
    final result = await _apiClient.setScanPolicy(
      SetScanPolicyApiRequestDto(
        scope: command.scope,
        sourceBindingId: command.sourceBindingId.value,
        intervalSeconds: command.intervalSeconds,
        freshnessSeconds: command.freshnessSeconds,
        retryBudget: command.retryBudget,
        idempotencyKey: command.idempotencyKey,
      ),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<ScanPolicy>.failure,
    );
  }
}
