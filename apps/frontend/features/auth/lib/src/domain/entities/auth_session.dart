import 'workspace_access.dart';

final class AuthSession {
  const AuthSession({
    required this.userLabel,
    required this.workspaces,
    this.selectedWorkspace,
  });

  final String userLabel;
  final List<WorkspaceAccess> workspaces;
  final WorkspaceAccess? selectedWorkspace;

  bool get hasWorkspace => selectedWorkspace != null;

  AuthSession copyWith({WorkspaceAccess? selectedWorkspace}) {
    return AuthSession(
      userLabel: userLabel,
      workspaces: workspaces,
      selectedWorkspace: selectedWorkspace ?? this.selectedWorkspace,
    );
  }
}
