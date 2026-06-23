import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/scan_run_api_dto.dart';

final class GeneratedScanRunRestMapper {
  const GeneratedScanRunRestMapper();

  RequestScanApiResponseDto request(generated.RequestScanResponseDto dto) {
    return RequestScanApiResponseDto(
      scanJobId: dto.scanJobId,
      status: dto.status.json ?? 'unknown',
      created: dto.created,
    );
  }

  ScanStatusApiDto status(generated.ScanStatusResponseDto dto) {
    return ScanStatusApiDto(
      scanJobId: dto.scanJobId,
      sourceBindingId: dto.sourceBindingId,
      scanPolicyId: dto.scanPolicyId,
      status: dto.status.json ?? 'unknown',
      userState: dto.userState.json ?? 'unknown',
      failureClass: dto.failureClass?.json,
      operatorAction: dto.operatorAction,
      requestedAt: dto.requestedAt,
      enqueuedAt: dto.enqueuedAt,
      completedAt: dto.completedAt,
      failureReason: dto.failureReason,
      latestAttempt: _attempt(dto.latestAttempt),
    );
  }

  ScanExecutionAttemptApiDto? _attempt(
    generated.ScanExecutionAttemptResponseDto? dto,
  ) {
    if (dto == null) {
      return null;
    }
    return ScanExecutionAttemptApiDto(
      sourceBindingId: dto.sourceBindingId,
      status: dto.status.json ?? 'unknown',
      startedAt: dto.startedAt,
      finishedAt: dto.finishedAt,
      fetched: dto.fetched,
      inserted: dto.inserted,
      skippedDuplicates: dto.skippedDuplicates,
      projected: dto.projected,
      failureReason: dto.failureReason,
    );
  }
}
