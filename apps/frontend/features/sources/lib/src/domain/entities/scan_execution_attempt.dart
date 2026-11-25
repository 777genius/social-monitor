import '../value_objects/scan_attempt_status.dart';
import '../value_objects/source_binding_id.dart';

final class ScanExecutionAttempt {
  const ScanExecutionAttempt({
    required this.sourceBindingId,
    required this.status,
    required this.startedAt,
    required this.fetched,
    required this.inserted,
    required this.skippedDuplicates,
    required this.projected,
    this.finishedAt,
    this.failureReason,
  });

  final SourceBindingId sourceBindingId;
  final ScanAttemptStatus status;
  final DateTime startedAt;
  final DateTime? finishedAt;
  final int fetched;
  final int inserted;
  final int skippedDuplicates;
  final int projected;
  final String? failureReason;
}
