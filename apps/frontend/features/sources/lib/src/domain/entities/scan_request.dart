import '../value_objects/scan_job_id.dart';
import '../value_objects/scan_job_status.dart';

final class ScanRequest {
  const ScanRequest({
    required this.scanJobId,
    required this.status,
    required this.created,
    required this.decision,
  });

  final ScanJobId scanJobId;
  final ScanJobStatus status;
  final bool created;
  final ScanRequestDecisionSnapshot decision;
}

final class ScanRequestDecisionSnapshot {
  const ScanRequestDecisionSnapshot({
    required this.decision,
    required this.reason,
    required this.createdNewScan,
    required this.signals,
    this.providerHealthState,
    this.nextEligibleAt,
    this.waitSeconds,
  });

  final String decision;
  final String reason;
  final bool createdNewScan;
  final String? providerHealthState;
  final DateTime? nextEligibleAt;
  final int? waitSeconds;
  final List<String> signals;

  bool get isBackoff =>
      decision == 'rate_limit_backoff' ||
      decision == 'provider_failure_backoff';
}
