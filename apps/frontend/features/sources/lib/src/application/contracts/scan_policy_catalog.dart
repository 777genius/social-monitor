import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/scan_policy.dart';
import '../commands/set_scan_policy_command.dart';
import '../queries/load_scan_policy_query.dart';

abstract interface class ScanPolicyCatalog {
  Future<Result<ScanPolicy>> loadScanPolicy(LoadScanPolicyQuery query);

  Future<Result<ScanPolicy>> setScanPolicy(SetScanPolicyCommand command);
}
