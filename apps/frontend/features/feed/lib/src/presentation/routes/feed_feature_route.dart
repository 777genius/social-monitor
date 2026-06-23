import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/feed_feature_module.dart';
import '../composition/feed_feature_module_host.dart';

class FeedFeatureRoute extends StatelessWidget {
  FeedFeatureRoute({super.key}) : _module = FeedFeatureModule();

  FeedFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
    String? topicId,
    String? topicTitle,
  }) : _module = FeedFeatureModule.generatedApi(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
         initialTopicId: topicId,
         initialTopicTitle: topicTitle,
       );

  final FeedFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    return ModuleScope<FeedFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      child: const FeedFeatureModuleHost(),
    );
  }
}
