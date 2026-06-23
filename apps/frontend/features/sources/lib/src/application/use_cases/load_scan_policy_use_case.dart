import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/scan_policy.dart';
import '../contracts/scan_policy_catalog.dart';
import '../queries/load_scan_policy_query.dart';

final class LoadScanPolicyUseCase {
  const LoadScanPolicyUseCase(this._catalog);

  final ScanPolicyCatalog _catalog;

  Future<Result<ScanPolicy>> call(LoadScanPolicyQuery query) {
    return _catalog.loadScanPolicy(query);
  }
}
