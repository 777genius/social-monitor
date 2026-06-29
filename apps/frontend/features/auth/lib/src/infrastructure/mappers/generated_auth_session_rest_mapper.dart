import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/auth_session.dart';
import '../../domain/entities/workspace_access.dart';

final class GeneratedAuthSessionRestMapper {
  const GeneratedAuthSessionRestMapper();

  AuthSession authSession(generated.AuthSessionResponseDto dto) {
    final workspaces = dto.workspaces
        .map(workspaceAccess)
        .toList(growable: false);
    final selectedWorkspace = workspaceAccess(dto.selectedWorkspace);

    return AuthSession(
      userId: dto.userId,
      userLabel: dto.userLabel,
      userRole: _userRole(dto.userRole),
      selectedWorkspace: selectedWorkspace,
      workspaces: _ensureSelectedWorkspace(workspaces, selectedWorkspace),
    );
  }

  WorkspaceAccess workspaceAccess(generated.AuthSessionWorkspaceDto dto) {
    return WorkspaceAccess(
      scope: WorkspaceScope(
        tenantId: dto.tenantId,
        workspaceId: dto.workspaceId,
      ),
      tenantName: dto.tenantName,
      workspaceName: dto.workspaceName,
      workspaceRole: _workspaceRole(dto.workspaceRole),
      statusLabel: dto.statusLabel,
    );
  }

  List<WorkspaceAccess> _ensureSelectedWorkspace(
    List<WorkspaceAccess> workspaces,
    WorkspaceAccess selectedWorkspace,
  ) {
    for (final workspace in workspaces) {
      if (workspace.scope == selectedWorkspace.scope) {
        return workspaces;
      }
    }
    return [selectedWorkspace, ...workspaces];
  }

  String _workspaceRole(
    generated.AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole role,
  ) {
    return role ==
            generated.AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole.$unknown
        ? 'viewer'
        : role.toJson();
  }

  String _userRole(generated.AuthSessionResponseDtoUserRoleUserRole role) {
    return role == generated.AuthSessionResponseDtoUserRoleUserRole.admin
        ? 'admin'
        : 'user';
  }
}
