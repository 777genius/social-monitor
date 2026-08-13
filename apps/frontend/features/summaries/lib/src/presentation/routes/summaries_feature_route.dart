import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/summaries_feature_module.dart';
import '../composition/summaries_feature_module_host.dart';

class SummariesFeatureRoute extends StatelessWidget {
  SummariesFeatureRoute({super.key, void Function()? onOpenWeeklySummary})
    : _module = SummariesFeatureModule(
        onOpenWeeklySummary: onOpenWeeklySummary,
      );

  SummariesFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
    required String userId,
    required void Function() onOpenWeeklySummary,
  }) : _module = SummariesFeatureModule.generatedApi(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
         userId: userId,
         onOpenWeeklySummary: onOpenWeeklySummary,
       );

  final SummariesFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    final host = SummariesFeatureModuleHost(module: _module);
    return ModuleScope<SummariesFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      loadingBuilder: (context) => host,
      child: host,
    );
  }
}
