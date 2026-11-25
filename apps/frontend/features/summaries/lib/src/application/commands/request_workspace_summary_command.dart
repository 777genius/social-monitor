import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/summary_period.dart';

final class RequestWorkspaceSummaryCommand {
  const RequestWorkspaceSummaryCommand({
    required this.scope,
    required this.userId,
    required this.idempotencyKey,
    required this.period,
  });

  final WorkspaceScope scope;
  final String userId;
  final String idempotencyKey;
  final SummaryPeriod period;
}
