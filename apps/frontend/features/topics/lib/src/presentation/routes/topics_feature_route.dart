import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../composition/topics_feature_module.dart';
import '../composition/topics_feature_module_host.dart';

class TopicsFeatureRoute extends StatelessWidget {
  const TopicsFeatureRoute({super.key});

  @override
  Widget build(BuildContext context) {
    return ModuleScope<TopicsFeatureModule>(
      module: TopicsFeatureModule(),
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: 'topics',
      child: const TopicsFeatureModuleHost(),
    );
  }
}
