import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../composition/settings_feature_module.dart';
import '../composition/settings_feature_module_host.dart';

class SettingsFeatureRoute extends StatelessWidget {
  const SettingsFeatureRoute({super.key});

  @override
  Widget build(BuildContext context) {
    return ModuleScope<SettingsFeatureModule>(
      module: SettingsFeatureModule(),
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: 'settings',
      child: const SettingsFeatureModuleHost(),
    );
  }
}
