import '../value_objects/scan_failure_class.dart';
import '../value_objects/scan_job_id.dart';
import '../value_objects/scan_job_status.dart';
import '../value_objects/scan_policy_id.dart';
import '../value_objects/scan_user_state.dart';
import '../value_objects/source_binding_id.dart';
import 'scan_execution_attempt.dart';

final class ScanStatusSnapshot {
  const ScanStatusSnapshot({
    required this.scanJobId,
    required this.sourceBindingId,
    required this.scanPolicyId,
    required this.status,
    required this.userState,
    required this.operatorAction,
    required this.requestedAt,
    this.enqueuedAt,
    this.completedAt,
    this.failureClass,
    this.failureReason,
    this.latestAttempt,
  });

  final ScanJobId scanJobId;
  final SourceBindingId sourceBindingId;
  final ScanPolicyId scanPolicyId;
  final ScanJobStatus status;
  final ScanUserState userState;
  final ScanFailureClass? failureClass;
  final String operatorAction;
  final DateTime requestedAt;
  final DateTime? enqueuedAt;
  final DateTime? completedAt;
  final String? failureReason;
  final ScanExecutionAttempt? latestAttempt;

  bool get isTerminal => status.isTerminal;
}
