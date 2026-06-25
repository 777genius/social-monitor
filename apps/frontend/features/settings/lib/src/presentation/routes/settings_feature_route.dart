import 'package:flutter/material.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../composition/settings_feature_module.dart';
import '../composition/settings_feature_module_host.dart';

class SettingsFeatureRoute extends StatelessWidget {
  const SettingsFeatureRoute({
    super.key,
    this.themeMode,
    this.onThemeModeChanged,
  });

  final ThemeMode? themeMode;
  final ValueChanged<ThemeMode>? onThemeModeChanged;

  @override
  Widget build(BuildContext context) {
    final host = SettingsFeatureModuleHost(
      themeMode: themeMode,
      onThemeModeChanged: onThemeModeChanged,
    );
    return ModuleScope<SettingsFeatureModule>(
      module: SettingsFeatureModule(),
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: 'settings',
      loadingBuilder: (context) => host,
      child: host,
    );
  }
}
