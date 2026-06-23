import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/scan_policy_api_dto.dart';

abstract interface class ScanPoliciesApiClient {
  Future<Result<ScanPolicyApiDto>> loadScanPolicy(
    ScanPolicyApiRequestDto request,
  );

  Future<Result<ScanPolicyApiDto>> setScanPolicy(
    SetScanPolicyApiRequestDto request,
  );
}
