import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_interest_id.dart';
import '../composition/sources_feature_module.dart';
import '../composition/sources_feature_module_host.dart';

class SourcesFeatureRoute extends StatelessWidget {
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
    required String interestId,
    required String interestTitle,
  }) : _module = SourcesFeatureModule.sourceBindings(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
         sourceBindingInterestId: SourceInterestId(interestId),
         sourceBindingInterestTitle: interestTitle,
       );

  SourcesFeatureRoute.sourceBindingsDemo({
    super.key,
    required String interestId,
    required String interestTitle,
  }) : _module = SourcesFeatureModule.sourceBindingsDemo(
         sourceBindingInterestId: SourceInterestId(interestId),
         sourceBindingInterestTitle: interestTitle,
       );

  final SourcesFeatureModule _module;
  final GlobalKey _hostKey = GlobalKey(debugLabel: 'sources-feature-host');

  @override
  Widget build(BuildContext context) {
    final host = SourcesFeatureModuleHost(key: _hostKey);
    return ModuleScope<SourcesFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      loadingBuilder: (context) => host,
      child: host,
    );
  }
}
