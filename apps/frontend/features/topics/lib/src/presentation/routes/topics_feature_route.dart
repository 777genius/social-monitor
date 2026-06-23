import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/topics_feature_module.dart';
import '../composition/topics_feature_module_host.dart';

class TopicsFeatureRoute extends StatelessWidget {
  TopicsFeatureRoute({super.key}) : _module = TopicsFeatureModule();

  TopicsFeatureRoute.demo({
    super.key,
    void Function(String topicId, String topicTitle)? onOpenTopicSources,
  }) : _module = TopicsFeatureModule.demo(
         onOpenTopicSources: onOpenTopicSources,
       );

  TopicsFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
    void Function(String topicId, String topicTitle)? onOpenTopicSources,
  }) : _module = TopicsFeatureModule.generatedApi(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
         onOpenTopicSources: onOpenTopicSources,
       );

  final TopicsFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    return ModuleScope<TopicsFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      child: const TopicsFeatureModuleHost(),
    );
  }
}
