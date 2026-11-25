import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/scan_run_api_dto.dart';

abstract interface class ScanRunsApiClient {
  Future<Result<RequestScanApiResponseDto>> requestScan(
    RequestScanApiRequestDto request,
  );

  Future<Result<ScanStatusApiDto>> loadScanStatus(
    ScanStatusApiRequestDto request,
  );
}
