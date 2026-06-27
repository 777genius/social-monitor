import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/session_gateway.dart';
import '../../domain/entities/workspace_access.dart';
import '../../infrastructure/repositories/demo_session_gateway.dart';
import '../../infrastructure/repositories/runtime_session_gateway.dart';

final class AuthFeatureModule extends Module {
  AuthFeatureModule.demo()
    : userLabel = null,
      workspaces = null,
      selectedScope = null,
      onWorkspaceSelected = null;

  AuthFeatureModule.runtime({
    required this.userLabel,
    required List<
      ({
        WorkspaceScope scope,
        String tenantName,
        String workspaceName,
        String statusLabel,
      })
    >
    workspaces,
    required this.selectedScope,
    required this.onWorkspaceSelected,
  }) : workspaces = workspaces
           .map(
             (workspace) => WorkspaceAccess(
               scope: workspace.scope,
               tenantName: workspace.tenantName,
               workspaceName: workspace.workspaceName,
               statusLabel: workspace.statusLabel,
             ),
           )
           .toList(growable: false);

  final String? userLabel;
  final List<WorkspaceAccess>? workspaces;
  final WorkspaceScope? selectedScope;
  final void Function(WorkspaceScope scope)? onWorkspaceSelected;

  Object get retentionKey {
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
    final runtimeWorkspaces = workspaces;
    final runtimeUserLabel = userLabel;
    if (runtimeWorkspaces != null && runtimeUserLabel != null) {
      return RuntimeSessionGateway(
        userLabel: runtimeUserLabel,
        workspaces: runtimeWorkspaces,
        selectedScope: selectedScope,
        onWorkspaceSelected: onWorkspaceSelected,
      );
    }
    return DemoSessionGateway();
  }
}
