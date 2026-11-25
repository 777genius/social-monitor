import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/session_gateway.dart';
import '../../domain/entities/auth_session.dart';
import '../../domain/entities/workspace_access.dart';

final class RuntimeSessionGateway implements SessionGateway {
  RuntimeSessionGateway({
    required String userId,
    required String userLabel,
    required String userRole,
    required List<WorkspaceAccess> workspaces,
    WorkspaceScope? selectedScope,
    void Function(WorkspaceScope scope)? onWorkspaceSelected,
  }) : _workspaces = List<WorkspaceAccess>.unmodifiable(workspaces),
       _userId = userId,
       _userLabel = userLabel,
       _userRole = userRole,
       _onWorkspaceSelected = onWorkspaceSelected {
    _selectedWorkspace = _workspaceFor(selectedScope);
  }

  final String _userId;
  final String _userLabel;
  final String _userRole;
  final List<WorkspaceAccess> _workspaces;
  final void Function(WorkspaceScope scope)? _onWorkspaceSelected;
  WorkspaceAccess? _selectedWorkspace;

  @override
  Future<Result<AuthSession>> restoreSession() async {
    if (_workspaces.isEmpty) {
      return const Result.failure(
        ValidationFailure(
          message: 'Runtime session is not configured with workspace access',
          code: 'auth.runtime_workspace_missing',
        ),
      );
    }
    return Result.success(_session());
  }

  @override
  Future<Result<AuthSession>> selectWorkspace(WorkspaceScope scope) async {
    final workspace = _workspaceFor(scope);
    if (workspace == null) {
      return const Result.failure(
        ValidationFailure(
          message: 'Selected workspace is not available in this session',
          code: 'auth.workspace_not_available',
          field: 'workspaceId',
        ),
      );
    }
    _selectedWorkspace = workspace;
    _onWorkspaceSelected?.call(scope);
    return Result.success(_session());
  }

  AuthSession _session() {
    return AuthSession(
      userId: _userId,
      userLabel: _userLabel,
      userRole: _userRole,
      workspaces: _workspaces,
      selectedWorkspace: _selectedWorkspace,
    );
  }

  WorkspaceAccess? _workspaceFor(WorkspaceScope? scope) {
    if (scope == null || !scope.isValid) {
      return null;
    }
    for (final workspace in _workspaces) {
      if (workspace.scope == scope) {
        return workspace;
      }
    }
    return null;
  }
}
