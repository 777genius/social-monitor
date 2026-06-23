import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/scan_job_id.dart';

final class LoadScanStatusQuery {
  const LoadScanStatusQuery({required this.scope, required this.scanJobId});

  final WorkspaceScope scope;
  final ScanJobId scanJobId;
}
