import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/summary_period.dart';

final class LoadWorkspaceSummaryQuery {
  const LoadWorkspaceSummaryQuery({
    required this.scope,
    required this.period,
    this.allowLatestFallback = true,
  });

  final WorkspaceScope scope;
  final SummaryPeriod period;
  final bool allowLatestFallback;
}
