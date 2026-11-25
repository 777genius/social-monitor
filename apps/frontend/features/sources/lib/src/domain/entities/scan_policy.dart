import '../value_objects/scan_policy_id.dart';
import '../value_objects/source_binding_id.dart';

final class ScanPolicy {
  const ScanPolicy({
    required this.id,
    required this.sourceBindingId,
    required this.intervalSeconds,
    required this.freshnessSeconds,
    required this.retryBudget,
    required this.nextRunAt,
    required this.createdAt,
  });

  final ScanPolicyId id;
  final SourceBindingId sourceBindingId;
  final int intervalSeconds;
  final int freshnessSeconds;
  final int retryBudget;
  final DateTime nextRunAt;
  final DateTime createdAt;
}
