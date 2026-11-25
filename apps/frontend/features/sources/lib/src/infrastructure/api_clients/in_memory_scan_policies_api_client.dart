import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/scan_policy_api_dto.dart';
import 'scan_policies_api_client.dart';

final class InMemoryScanPoliciesApiClient implements ScanPoliciesApiClient {
  InMemoryScanPoliciesApiClient({List<ScanPolicyApiDto> items = const []}) {
    for (final item in items) {
      _items[item.sourceBindingId] = item;
    }
  }

  final Map<String, ScanPolicyApiDto> _items = {};
  int _counter = 0;

  @override
  Future<Result<ScanPolicyApiDto>> loadScanPolicy(
    ScanPolicyApiRequestDto request,
  ) async {
    final item = _items[request.sourceBindingId];
    if (item == null) {
      return Result.failure(
        NotFoundFailure(
          message: 'Scan policy is not configured for this source binding',
          code: 'scan_policy.not_found',
        ),
      );
    }
    return Result.success(item);
  }

  @override
  Future<Result<ScanPolicyApiDto>> setScanPolicy(
    SetScanPolicyApiRequestDto request,
  ) async {
    _counter += 1;
    final previous = _items[request.sourceBindingId];
    final createdAt = previous?.createdAt ?? DateTime.utc(2026, 6, 23, 12);
    final policy = ScanPolicyApiDto(
      id: previous?.id ?? 'scan-policy-$_counter',
      sourceBindingId: request.sourceBindingId,
      intervalSeconds: request.intervalSeconds,
      freshnessSeconds: request.freshnessSeconds,
      retryBudget: request.retryBudget,
      nextRunAt: DateTime.utc(
        2026,
        6,
        23,
        12,
      ).add(Duration(seconds: request.intervalSeconds)),
      createdAt: createdAt,
    );
    _items[request.sourceBindingId] = policy;
    return Result.success(policy);
  }
}
