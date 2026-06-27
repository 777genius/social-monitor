import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/summary_period.dart';

final class LoadWorkspaceSummaryQuery {
  const LoadWorkspaceSummaryQuery({required this.scope, required this.period});

  final WorkspaceScope scope;
  final SummaryPeriod period;
}
