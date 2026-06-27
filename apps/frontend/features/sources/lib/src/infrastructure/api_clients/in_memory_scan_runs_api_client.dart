import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/scan_run_api_dto.dart';
import 'scan_runs_api_client.dart';

final class InMemoryScanRunsApiClient implements ScanRunsApiClient {
  InMemoryScanRunsApiClient({List<ScanStatusApiDto> statuses = const []}) {
    for (final status in statuses) {
      _statuses[status.scanJobId] = status;
    }
  }

  final Map<String, ScanStatusApiDto> _statuses = {};
  int _counter = 0;

  @override
  Future<Result<RequestScanApiResponseDto>> requestScan(
    RequestScanApiRequestDto request,
  ) async {
    _counter += 1;
    final scanJobId = 'scan-job-$_counter';
    _statuses[scanJobId] = ScanStatusApiDto(
      scanJobId: scanJobId,
      sourceBindingId: request.sourceBindingId,
      scanPolicyId: 'scan-policy-${request.sourceBindingId}',
      status: 'enqueued',
      userState: 'scan_pending',
      operatorAction: 'Scan queued for collection worker',
      requestedAt: DateTime.utc(2026, 6, 23, 12),
      enqueuedAt: DateTime.utc(2026, 6, 23, 12),
    );
    return Result.success(
      RequestScanApiResponseDto(
        scanJobId: scanJobId,
        status: 'enqueued',
        created: true,
        requestDecision: const ScanRequestDecisionApiDto(
          decision: 'created',
          reason: 'manual_scan_requested',
          createdNewScan: true,
          signals: ['manual_request'],
        ),
      ),
    );
  }

  @override
  Future<Result<ScanStatusApiDto>> loadScanStatus(
    ScanStatusApiRequestDto request,
  ) async {
    final status = _statuses[request.scanJobId];
    if (status == null) {
      return Result.failure(
        NotFoundFailure(
          message: 'Scan status was not found',
          code: 'scan_status.not_found',
        ),
      );
    }
    return Result.success(status);
  }
}
