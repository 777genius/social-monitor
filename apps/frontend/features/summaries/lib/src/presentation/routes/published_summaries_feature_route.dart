import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/published_summaries_feature_module.dart';
import '../composition/published_summaries_feature_module_host.dart';

class PublishedSummariesFeatureRoute extends StatelessWidget {
  PublishedSummariesFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
    String? summaryId,
  }) : _module = PublishedSummariesFeatureModule(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
         summaryId: summaryId,
       );

  final PublishedSummariesFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    final host = PublishedSummariesFeatureModuleHost(module: _module);
    return ModuleScope<PublishedSummariesFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      loadingBuilder: (context) => host,
      child: host,
    );
  }
}
