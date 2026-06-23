import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../composition/feed_feature_module.dart';
import '../composition/feed_feature_module_host.dart';

class FeedFeatureRoute extends StatelessWidget {
  const FeedFeatureRoute({super.key});

  @override
  Widget build(BuildContext context) {
    return ModuleScope<FeedFeatureModule>(
      module: FeedFeatureModule(),
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: 'feed',
      child: const FeedFeatureModuleHost(),
    );
  }
}
