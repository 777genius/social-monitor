import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/auth_feature_module.dart';
import '../composition/auth_feature_module_host.dart';
import 'auth_route_snapshot.dart';

export 'auth_route_snapshot.dart';

class AuthFeatureRoute extends StatelessWidget {
  const AuthFeatureRoute({super.key}) : module = null;

  AuthFeatureRoute.runtime({
    super.key,
    required Object? generatedApiRuntime,
    required String userId,
    required String userLabel,
    required List<AuthWorkspaceRouteSnapshot> workspaces,
    required WorkspaceScope? selectedScope,
    required void Function(AuthSessionRouteSnapshot session) onSessionRestored,
    required void Function(AuthWorkspaceRouteSnapshot workspace)
    onWorkspaceSelected,
  }) : module = AuthFeatureModule.runtime(
         generatedApiRuntime: generatedApiRuntime,
         userId: userId,
         userLabel: userLabel,
         workspaces: workspaces,
         selectedScope: selectedScope,
         onSessionRestored: onSessionRestored,
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
