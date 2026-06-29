import 'workspace_access.dart';

final class AuthSession {
  const AuthSession({
    required this.userId,
    required this.userLabel,
    required this.userRole,
    required this.workspaces,
    this.selectedWorkspace,
  });

  final String userId;
  final String userLabel;
  final String userRole;
  final List<WorkspaceAccess> workspaces;
  final WorkspaceAccess? selectedWorkspace;

  bool get hasWorkspace => selectedWorkspace != null;

  AuthSession copyWith({WorkspaceAccess? selectedWorkspace}) {
    return AuthSession(
      userId: userId,
      userLabel: userLabel,
      userRole: userRole,
      workspaces: workspaces,
      selectedWorkspace: selectedWorkspace ?? this.selectedWorkspace,
    );
  }
}
