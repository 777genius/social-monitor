import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/value_objects/scan_attempt_status.dart';
import '../../domain/value_objects/scan_failure_class.dart';
import '../../domain/value_objects/scan_job_status.dart';
import '../../domain/value_objects/scan_user_state.dart';

String scanJobStatusLabel(ScanJobStatus status) {
  return switch (status) {
    ScanJobStatus.requested => 'Requested',
    ScanJobStatus.enqueued => 'Queued',
    ScanJobStatus.succeeded => 'Completed',
    ScanJobStatus.failed => 'Failed',
    ScanJobStatus.unknown => 'Unknown',
  };
}

String scanUserStateLabel(ScanUserState state) {
  return switch (state) {
    ScanUserState.scanPending => 'Pending',
    ScanUserState.scanInProgress => 'Running',
    ScanUserState.contentCurrent => 'Content current',
    ScanUserState.scanDegraded => 'Needs attention',
    ScanUserState.unknown => 'Unknown',
  };
}

String scanAttemptStatusLabel(ScanAttemptStatus status) {
  return switch (status) {
    ScanAttemptStatus.running => 'Running',
    ScanAttemptStatus.succeeded => 'Completed',
    ScanAttemptStatus.failed => 'Failed',
    ScanAttemptStatus.unknown => 'Unknown',
  };
}

String scanFailureClassLabel(ScanFailureClass failureClass) {
  return switch (failureClass) {
    ScanFailureClass.providerUnavailable => 'Provider unavailable',
    ScanFailureClass.providerRateLimited => 'Provider rate limited',
    ScanFailureClass.workerConflict => 'Worker conflict',
    ScanFailureClass.systemFailure => 'System failure',
    ScanFailureClass.unknown => 'Unknown failure',
  };
}

AppStatusTone scanStatusTone(ScanJobStatus status, ScanUserState userState) {
  if (status == ScanJobStatus.failed ||
      userState == ScanUserState.scanDegraded) {
    return AppStatusTone.danger;
  }
  if (status == ScanJobStatus.succeeded ||
      userState == ScanUserState.contentCurrent) {
    return AppStatusTone.success;
  }
  if (status == ScanJobStatus.requested ||
      status == ScanJobStatus.enqueued ||
      userState == ScanUserState.scanPending ||
      userState == ScanUserState.scanInProgress) {
    return AppStatusTone.warning;
  }
  return AppStatusTone.neutral;
}
