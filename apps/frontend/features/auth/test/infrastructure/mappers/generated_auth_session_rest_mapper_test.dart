import 'package:social_monitor_auth/src/infrastructure/mappers/generated_auth_session_rest_mapper.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:test/test.dart';

void main() {
  const mapper = GeneratedAuthSessionRestMapper();

  test('maps generated auth session DTOs into auth domain entities', () {
    final session = mapper.authSession(
      const generated.AuthSessionResponseDto(
        userId: 'user-1',
        userLabel: 'Operator',
        userRole: generated.AuthSessionResponseDtoUserRoleUserRole.admin,
        selectedWorkspace: generated.AuthSessionWorkspaceDto(
          tenantId: 'tenant-1',
          workspaceId: 'workspace-1',
          tenantName: 'Acme',
          workspaceName: 'Acme alerts',
          workspaceRole:
              generated.AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole.admin,
          statusLabel: 'Active',
        ),
        workspaces: [
          generated.AuthSessionWorkspaceDto(
            tenantId: 'tenant-1',
            workspaceId: 'workspace-1',
            tenantName: 'Acme',
            workspaceName: 'Acme alerts',
            workspaceRole: generated
                .AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole
                .admin,
            statusLabel: 'Active',
          ),
        ],
      ),
    );

    expect(session.userId, 'user-1');
    expect(session.userLabel, 'Operator');
    expect(session.userRole, 'admin');
    expect(session.selectedWorkspace?.scope.tenantId, 'tenant-1');
    expect(session.selectedWorkspace?.workspaceRole, 'admin');
    expect(session.workspaces, hasLength(1));
  });

  test('maps unknown workspace role to the lowest privilege fallback', () {
    final workspace = mapper.workspaceAccess(
      const generated.AuthSessionWorkspaceDto(
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        tenantName: 'Acme',
        workspaceName: 'Acme alerts',
        workspaceRole: generated
            .AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole
            .$unknown,
        statusLabel: 'Active',
      ),
    );

    expect(workspace.workspaceRole, 'viewer');
  });

  test('maps unknown user role to the lowest privilege fallback', () {
    final session = mapper.authSession(
      const generated.AuthSessionResponseDto(
        userId: 'user-1',
        userLabel: 'Operator',
        userRole: generated.AuthSessionResponseDtoUserRoleUserRole.$unknown,
        selectedWorkspace: generated.AuthSessionWorkspaceDto(
          tenantId: 'tenant-1',
          workspaceId: 'workspace-1',
          tenantName: 'Acme',
          workspaceName: 'Acme alerts',
          workspaceRole:
              generated.AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole.admin,
          statusLabel: 'Active',
        ),
        workspaces: [],
      ),
    );

    expect(session.userRole, 'user');
  });
}
