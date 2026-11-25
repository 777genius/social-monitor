import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/scan_request.dart';
import '../commands/request_scan_command.dart';
import '../contracts/scan_run_catalog.dart';

final class RequestScanUseCase {
  const RequestScanUseCase(this._catalog);

  final ScanRunCatalog _catalog;

  Future<Result<ScanRequest>> call(RequestScanCommand command) {
    return _catalog.requestScan(command);
  }
}
