import 'package:social_monitor_auth/src/domain/entities/auth_session.dart';
import 'package:social_monitor_auth/src/domain/entities/workspace_access.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

const primaryWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-demo',
  workspaceId: 'workspace-primary',
);

const secondaryWorkspaceScope = WorkspaceScope(
  tenantId: 'tenant-demo',
  workspaceId: 'workspace-secondary',
);

const primaryWorkspace = WorkspaceAccess(
  scope: primaryWorkspaceScope,
  tenantName: 'Acme',
  workspaceName: 'Acme alerts',
  statusLabel: 'Active',
);

const secondaryWorkspace = WorkspaceAccess(
  scope: secondaryWorkspaceScope,
  tenantName: 'Acme',
  workspaceName: 'Launch lab',
  statusLabel: 'Ready',
);

AuthSession authSession({WorkspaceAccess? selectedWorkspace}) {
  return AuthSession(
    userLabel: 'MVP Operator',
    selectedWorkspace: selectedWorkspace ?? primaryWorkspace,
    workspaces: const [primaryWorkspace, secondaryWorkspace],
  );
}

AuthSession authSessionWithoutWorkspace() {
  return const AuthSession(
    userLabel: 'MVP Operator',
    workspaces: [primaryWorkspace, secondaryWorkspace],
  );
}
