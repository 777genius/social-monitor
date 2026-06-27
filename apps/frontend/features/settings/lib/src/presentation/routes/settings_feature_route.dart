import 'package:flutter/material.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/settings_feature_module.dart';
import '../composition/settings_feature_module_host.dart';

class SettingsFeatureRoute extends StatelessWidget {
  const SettingsFeatureRoute({
    super.key,
    this.themeMode,
    this.onThemeModeChanged,
  }) : module = null;

  SettingsFeatureRoute.runtime({
    super.key,
    required WorkspaceScope scope,
    required String workspaceRole,
    required String traceId,
    required String featureSnapshot,
    this.themeMode,
    this.onThemeModeChanged,
  }) : module = SettingsFeatureModule.runtime(
         scope: scope,
         workspaceRole: workspaceRole,
         traceId: traceId,
         featureSnapshot: featureSnapshot,
       );

  final ThemeMode? themeMode;
  final ValueChanged<ThemeMode>? onThemeModeChanged;
  final SettingsFeatureModule? module;

  @override
  Widget build(BuildContext context) {
    final resolvedModule = module ?? SettingsFeatureModule.demo();
    final host = SettingsFeatureModuleHost(
      themeMode: themeMode,
      onThemeModeChanged: onThemeModeChanged,
    );
    return ModuleScope<SettingsFeatureModule>(
      module: resolvedModule,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: resolvedModule.retentionKey,
      loadingBuilder: (context) => const SizedBox.shrink(),
      child: host,
    );
  }
}
