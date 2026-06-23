import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../composition/sources_feature_module.dart';
import '../composition/sources_feature_module_host.dart';

class SourcesFeatureRoute extends StatelessWidget {
  const SourcesFeatureRoute({super.key});

  @override
  Widget build(BuildContext context) {
    return ModuleScope<SourcesFeatureModule>(
      module: SourcesFeatureModule(),
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: 'sources',
      child: const SourcesFeatureModuleHost(),
    );
  }
}
