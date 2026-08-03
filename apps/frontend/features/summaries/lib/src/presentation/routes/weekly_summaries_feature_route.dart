import 'package:flutter/material.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/weekly_summaries_feature_module.dart';
import '../composition/weekly_summaries_feature_module_host.dart';

class WeeklySummariesFeatureRoute extends StatelessWidget {
  WeeklySummariesFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
  }) : _module = WeeklySummariesFeatureModule(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
       );

  final WeeklySummariesFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    final host = WeeklySummariesFeatureModuleHost(
      key: ValueKey<Object>(_module.retentionKey),
      module: _module,
    );
    return ModuleScope<WeeklySummariesFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      loadingBuilder: (context) => const Center(
        key: ValueKey('weekly-summaries-module-loading'),
        child: CircularProgressIndicator(),
      ),
      child: host,
    );
  }
}
