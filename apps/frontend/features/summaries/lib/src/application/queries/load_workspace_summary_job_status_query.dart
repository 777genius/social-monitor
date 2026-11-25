import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class LoadWorkspaceSummaryJobStatusQuery {
  const LoadWorkspaceSummaryJobStatusQuery({
    required this.scope,
    required this.summaryJobId,
  });

  final WorkspaceScope scope;
  final String summaryJobId;
}
