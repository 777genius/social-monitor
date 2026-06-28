import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/session_gateway.dart';
import '../../domain/entities/auth_session.dart';
import '../../domain/entities/workspace_access.dart';
import '../../infrastructure/api_clients/generated_auth_session_gateway.dart';
import '../../infrastructure/repositories/demo_session_gateway.dart';
import '../../infrastructure/repositories/runtime_session_gateway.dart';
import '../routes/auth_route_snapshot.dart';

final class AuthFeatureModule extends Module {
  AuthFeatureModule.demo()
    : generatedApiRuntime = null,
      userId = null,
      userLabel = null,
      workspaces = null,
      selectedScope = null,
      onSessionRestored = null,
      onWorkspaceSelected = null;

  AuthFeatureModule.runtime({
    required this.generatedApiRuntime,
    required this.userId,
    required this.userLabel,
    required List<AuthWorkspaceRouteSnapshot> workspaces,
    required this.selectedScope,
    required this.onSessionRestored,
    required this.onWorkspaceSelected,
  }) : workspaces = workspaces
           .map(
             (workspace) => WorkspaceAccess(
               scope: workspace.scope,
               tenantName: workspace.tenantName,
               workspaceName: workspace.workspaceName,
               workspaceRole: workspace.workspaceRole,
               statusLabel: workspace.statusLabel,
             ),
           )
           .toList(growable: false);

  final Object? generatedApiRuntime;
  final String? userId;
  final String? userLabel;
  final List<WorkspaceAccess>? workspaces;
  final WorkspaceScope? selectedScope;
  final void Function(AuthSessionRouteSnapshot session)? onSessionRestored;
  final void Function(AuthWorkspaceRouteSnapshot workspace)?
  onWorkspaceSelected;

  Object get retentionKey {
    if (generatedApiRuntime != null) {
      final scope = selectedScope;
      if (scope == null) {
        return 'auth-generated-runtime';
      }
      return 'auth-generated-${scope.tenantId}-${scope.workspaceId}';
    }
    if (workspaces == null) {
      return 'auth-demo';
    }
    final scope = selectedScope;
    if (scope == null) {
      return 'auth-runtime-missing';
    }
    return 'auth-${scope.tenantId}-${scope.workspaceId}';
  }

  @override
  void binds(Binder i) {
    i.registerLazySingleton<SessionGateway>(_createGateway);
  }

  SessionGateway _createGateway() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedAuthSessionGateway.fromRuntime(
        runtime: runtime,
        onSessionRestored: (session) {
          final snapshot = _sessionSnapshot(session);
          if (snapshot != null) {
            onSessionRestored?.call(snapshot);
          }
        },
        onWorkspaceSelected: (workspace) {
          onWorkspaceSelected?.call(_workspaceSnapshot(workspace));
        },
      );
    }

    final runtimeWorkspaces = workspaces;
    final runtimeUserId = userId;
    final runtimeUserLabel = userLabel;
    if (runtimeWorkspaces != null &&
        runtimeUserId != null &&
        runtimeUserLabel != null) {
      return RuntimeSessionGateway(
        userId: runtimeUserId,
        userLabel: runtimeUserLabel,
        workspaces: runtimeWorkspaces,
        selectedScope: selectedScope,
        onWorkspaceSelected: (scope) {
          final workspace = _workspaceFor(runtimeWorkspaces, scope);
          if (workspace != null) {
            onWorkspaceSelected?.call(_workspaceSnapshot(workspace));
          }
        },
      );
    }
    return DemoSessionGateway();
  }

  AuthSessionRouteSnapshot? _sessionSnapshot(AuthSession session) {
    final selectedWorkspace = session.selectedWorkspace;
    if (selectedWorkspace == null) {
      return null;
    }

    return (
      userId: session.userId,
      userLabel: session.userLabel,
      selectedWorkspace: _workspaceSnapshot(selectedWorkspace),
      workspaces: session.workspaces
          .map(_workspaceSnapshot)
          .toList(growable: false),
    );
  }

  AuthWorkspaceRouteSnapshot _workspaceSnapshot(WorkspaceAccess workspace) {
    return (
      scope: workspace.scope,
      tenantName: workspace.tenantName,
      workspaceName: workspace.workspaceName,
      workspaceRole: workspace.workspaceRole,
      statusLabel: workspace.statusLabel,
    );
  }

  WorkspaceAccess? _workspaceFor(
    List<WorkspaceAccess> workspaces,
    WorkspaceScope scope,
  ) {
    for (final workspace in workspaces) {
      if (workspace.scope == scope) {
        return workspace;
      }
    }
    return null;
  }
}
