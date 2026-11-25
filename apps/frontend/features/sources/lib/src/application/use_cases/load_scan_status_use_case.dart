import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/scan_status_snapshot.dart';
import '../contracts/scan_run_catalog.dart';
import '../queries/load_scan_status_query.dart';

final class LoadScanStatusUseCase {
  const LoadScanStatusUseCase(this._catalog);

  final ScanRunCatalog _catalog;

  Future<Result<ScanStatusSnapshot>> call(LoadScanStatusQuery query) {
    return _catalog.loadScanStatus(query);
  }
}
