import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_topic_id.dart';
import '../composition/sources_feature_module.dart';
import '../composition/sources_feature_module_host.dart';
import '../stores/sources_catalog_store.dart';

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
    const host = SourcesFeatureModuleHost();
    return ModuleScope<SourcesFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      loadingBuilder: (context) => const _LoadedModuleFallback(child: host),
      child: host,
    );
  }
}

class _LoadedModuleFallback extends StatefulWidget {
  const _LoadedModuleFallback({required this.child});

  final Widget child;

  @override
  State<_LoadedModuleFallback> createState() => _LoadedModuleFallbackState();
}

class _LoadedModuleFallbackState extends State<_LoadedModuleFallback> {
  Timer? _statusCheckTimer;

  @override
  void initState() {
    super.initState();
    _statusCheckTimer = Timer.periodic(const Duration(milliseconds: 50), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _statusCheckTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.getInheritedWidgetOfExactType<ModuleProvider>();
    final store = provider?.controller.binder.tryGet<SourcesCatalogStore>();
    if (store != null) {
      _statusCheckTimer?.cancel();
      return widget.child;
    }

    return const Center(
      child: Text('Loading sources', textDirection: TextDirection.ltr),
    );
  }
}
