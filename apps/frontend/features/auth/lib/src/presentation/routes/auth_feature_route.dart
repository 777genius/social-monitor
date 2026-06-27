import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/auth_feature_module.dart';
import '../composition/auth_feature_module_host.dart';

class AuthFeatureRoute extends StatelessWidget {
  const AuthFeatureRoute({super.key}) : module = null;

  AuthFeatureRoute.runtime({
    super.key,
    required String userLabel,
    required List<
      ({
        WorkspaceScope scope,
        String tenantName,
        String workspaceName,
        String statusLabel,
      })
    >
    workspaces,
    required WorkspaceScope? selectedScope,
    required void Function(WorkspaceScope scope) onWorkspaceSelected,
  }) : module = AuthFeatureModule.runtime(
         userLabel: userLabel,
         workspaces: workspaces,
         selectedScope: selectedScope,
         onWorkspaceSelected: onWorkspaceSelected,
       );

  final AuthFeatureModule? module;

  @override
  Widget build(BuildContext context) {
    final resolvedModule = module ?? AuthFeatureModule.demo();
    const host = AuthFeatureModuleHost();
    return ModuleScope<AuthFeatureModule>(
      module: resolvedModule,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: resolvedModule.retentionKey,
      loadingBuilder: (context) => const SizedBox.shrink(),
      child: host,
    );
  }
}
