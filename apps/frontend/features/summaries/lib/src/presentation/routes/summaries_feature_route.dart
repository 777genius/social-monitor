import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../composition/summaries_feature_module.dart';
import '../composition/summaries_feature_module_host.dart';

class SummariesFeatureRoute extends StatelessWidget {
  const SummariesFeatureRoute({super.key});

  @override
  Widget build(BuildContext context) {
    return ModuleScope<SummariesFeatureModule>(
      module: SummariesFeatureModule(),
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: 'summaries',
      child: const SummariesFeatureModuleHost(),
    );
  }
}
