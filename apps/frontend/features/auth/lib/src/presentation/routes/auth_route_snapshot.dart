import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

typedef AuthWorkspaceRouteSnapshot = ({
  WorkspaceScope scope,
  String tenantName,
  String workspaceName,
  String workspaceRole,
  String statusLabel,
});

typedef AuthSessionRouteSnapshot = ({
  String userId,
  String userLabel,
  String userRole,
  AuthWorkspaceRouteSnapshot selectedWorkspace,
  List<AuthWorkspaceRouteSnapshot> workspaces,
});
