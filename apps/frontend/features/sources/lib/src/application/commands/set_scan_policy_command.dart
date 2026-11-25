import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_binding_id.dart';

final class SetScanPolicyCommand {
  const SetScanPolicyCommand({
    required this.scope,
    required this.sourceBindingId,
    required this.intervalSeconds,
    required this.freshnessSeconds,
    required this.retryBudget,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final SourceBindingId sourceBindingId;
  final int intervalSeconds;
  final int freshnessSeconds;
  final int retryBudget;
  final String idempotencyKey;
}
