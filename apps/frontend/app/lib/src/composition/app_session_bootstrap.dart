import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import 'app_runtime.dart';

/// Restores the backend session at app start so every page opens signed-in,
/// without requiring the user to visit the auth route first.
///
/// On failure the runtime stays in its restoring state: the auth page still
/// owns interactive repair (retry, workspace selection, error details).
Future<void> bootstrapAppSession(AppRuntimeController controller) async {
  final runtime = controller.runtime;
  final apiRuntime = runtime.generatedApiRuntime;
  if (!runtime.session.isRestoring ||
      apiRuntime is! generated.GeneratedApiRuntime) {
    return;
  }

  final result = await apiRuntime.client.sendUnscoped(
    () => apiRuntime.rest.auth.authSessionControllerGet(),
  );

  result.fold(
    onSuccess: (dto) {
      if (!controller.runtime.session.isRestoring) {
        return;
      }
      final selectedWorkspace = _workspaceSnapshot(dto.selectedWorkspace);
      controller.restoreAuthSession(
        userId: dto.userId,
        userLabel: dto.userLabel,
        userRole:
            dto.userRole == generated.AuthSessionResponseDtoUserRoleUserRole.admin
            ? 'admin'
            : 'user',
        selectedWorkspace: selectedWorkspace,
        availableWorkspaces: _ensureSelected(
          [for (final workspace in dto.workspaces) _workspaceSnapshot(workspace)],
          selectedWorkspace,
        ),
      );
    },
    onFailure: (_) {
      // Keep the restoring state; the auth page surfaces the failure and
      // offers an explicit refresh action.
    },
  );
}

AppWorkspaceSnapshot _workspaceSnapshot(
  generated.AuthSessionWorkspaceDto dto,
) {
  return AppWorkspaceSnapshot(
    tenantName: dto.tenantName,
    workspaceName: dto.workspaceName,
    statusLabel: dto.statusLabel,
    workspaceRole: _workspaceRole(dto.workspaceRole),
    scope: WorkspaceScope(
      tenantId: dto.tenantId,
      workspaceId: dto.workspaceId,
    ),
  );
}

String _workspaceRole(
  generated.AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole role,
) {
  return role ==
          generated.AuthSessionWorkspaceDtoWorkspaceRoleWorkspaceRole.$unknown
      ? 'viewer'
      : role.toJson();
}

List<AppWorkspaceSnapshot> _ensureSelected(
  List<AppWorkspaceSnapshot> workspaces,
  AppWorkspaceSnapshot selected,
) {
  for (final workspace in workspaces) {
    if (workspace.scope == selected.scope) {
      return workspaces;
    }
  }
  return [selected, ...workspaces];
}
