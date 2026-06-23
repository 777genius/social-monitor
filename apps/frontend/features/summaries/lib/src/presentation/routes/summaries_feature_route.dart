import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/summaries_feature_module.dart';
import '../composition/summaries_feature_module_host.dart';

class SummariesFeatureRoute extends StatelessWidget {
  SummariesFeatureRoute({super.key}) : _module = SummariesFeatureModule();

  SummariesFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
  }) : _module = SummariesFeatureModule.generatedApi(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
       );

  final SummariesFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    return ModuleScope<SummariesFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      child: const SummariesFeatureModuleHost(),
    );
  }
}
