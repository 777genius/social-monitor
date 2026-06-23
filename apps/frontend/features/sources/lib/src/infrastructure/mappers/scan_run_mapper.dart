import '../../domain/entities/scan_execution_attempt.dart';
import '../../domain/entities/scan_request.dart';
import '../../domain/entities/scan_status_snapshot.dart';
import '../../domain/value_objects/scan_attempt_status.dart';
import '../../domain/value_objects/scan_failure_class.dart';
import '../../domain/value_objects/scan_job_id.dart';
import '../../domain/value_objects/scan_job_status.dart';
import '../../domain/value_objects/scan_policy_id.dart';
import '../../domain/value_objects/scan_user_state.dart';
import '../../domain/value_objects/source_binding_id.dart';
import '../api/scan_run_api_dto.dart';

final class ScanRunMapper {
  const ScanRunMapper();

  ScanRequest requestToDomain(RequestScanApiResponseDto dto) {
    return ScanRequest(
      scanJobId: ScanJobId(dto.scanJobId),
      status: scanJobStatusFromApi(dto.status),
      created: dto.created,
    );
  }

  ScanStatusSnapshot statusToDomain(ScanStatusApiDto dto) {
    return ScanStatusSnapshot(
      scanJobId: ScanJobId(dto.scanJobId),
      sourceBindingId: SourceBindingId(dto.sourceBindingId),
      scanPolicyId: ScanPolicyId(dto.scanPolicyId),
      status: scanJobStatusFromApi(dto.status),
      userState: scanUserStateFromApi(dto.userState),
      failureClass: scanFailureClassFromApi(dto.failureClass),
      operatorAction: dto.operatorAction,
      requestedAt: dto.requestedAt,
      enqueuedAt: dto.enqueuedAt,
      completedAt: dto.completedAt,
      failureReason: dto.failureReason,
      latestAttempt: _attemptToDomain(dto.latestAttempt),
    );
  }

  ScanExecutionAttempt? _attemptToDomain(ScanExecutionAttemptApiDto? dto) {
    if (dto == null) {
      return null;
    }
    return ScanExecutionAttempt(
      sourceBindingId: SourceBindingId(dto.sourceBindingId),
      status: scanAttemptStatusFromApi(dto.status),
      startedAt: dto.startedAt,
      finishedAt: dto.finishedAt,
      fetched: dto.fetched.toInt(),
      inserted: dto.inserted.toInt(),
      skippedDuplicates: dto.skippedDuplicates.toInt(),
      projected: dto.projected.toInt(),
      failureReason: dto.failureReason,
    );
  }
}
