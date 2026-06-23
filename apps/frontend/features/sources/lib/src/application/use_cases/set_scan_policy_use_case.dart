import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/scan_policy.dart';
import '../commands/set_scan_policy_command.dart';
import '../contracts/scan_policy_catalog.dart';

final class SetScanPolicyUseCase {
  const SetScanPolicyUseCase(this._catalog);

  final ScanPolicyCatalog _catalog;

  Future<Result<ScanPolicy>> call(SetScanPolicyCommand command) {
    return _catalog.setScanPolicy(command);
  }
}
