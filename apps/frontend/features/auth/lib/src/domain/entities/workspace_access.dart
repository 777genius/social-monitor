import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class WorkspaceAccess {
  const WorkspaceAccess({
    required this.scope,
    required this.tenantName,
    required this.workspaceName,
    required this.statusLabel,
  });

  final WorkspaceScope scope;
  final String tenantName;
  final String workspaceName;
  final String statusLabel;
}
