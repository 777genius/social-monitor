import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/scan_request.dart';
import '../../domain/entities/scan_status_snapshot.dart';
import '../commands/request_scan_command.dart';
import '../queries/load_scan_status_query.dart';

abstract interface class ScanRunCatalog {
  Future<Result<ScanRequest>> requestScan(RequestScanCommand command);

  Future<Result<ScanStatusSnapshot>> loadScanStatus(LoadScanStatusQuery query);
}
