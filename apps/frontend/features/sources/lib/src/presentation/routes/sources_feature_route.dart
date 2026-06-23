import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_topic_id.dart';
import '../composition/sources_feature_module.dart';
import '../composition/sources_feature_module_host.dart';

class SourcesFeatureRoute extends StatelessWidget {
  SourcesFeatureRoute({super.key}) : _module = SourcesFeatureModule();

  SourcesFeatureRoute.sourceProfilesDemo({super.key})
    : _module = SourcesFeatureModule.sourceProfilesDemo();

  SourcesFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
  }) : _module = SourcesFeatureModule.generatedApi(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
       );

  SourcesFeatureRoute.sourceBindings({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
    required String topicId,
    required String topicTitle,
  }) : _module = SourcesFeatureModule.sourceBindings(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
         sourceBindingTopicId: SourceTopicId(topicId),
         sourceBindingTopicTitle: topicTitle,
       );

  SourcesFeatureRoute.sourceBindingsDemo({
    super.key,
    required String topicId,
    required String topicTitle,
  }) : _module = SourcesFeatureModule.sourceBindingsDemo(
         sourceBindingTopicId: SourceTopicId(topicId),
         sourceBindingTopicTitle: topicTitle,
       );

  final SourcesFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    return ModuleScope<SourcesFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      child: const SourcesFeatureModuleHost(),
    );
  }
}
