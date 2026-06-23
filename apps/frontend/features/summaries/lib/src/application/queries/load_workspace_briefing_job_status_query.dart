import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class LoadWorkspaceBriefingJobStatusQuery {
  const LoadWorkspaceBriefingJobStatusQuery({
    required this.scope,
    required this.briefingJobId,
  });

  final WorkspaceScope scope;
  final String briefingJobId;
}
