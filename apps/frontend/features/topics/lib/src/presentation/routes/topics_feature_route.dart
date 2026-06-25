import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/topics_feature_module.dart';
import '../composition/topics_feature_module_host.dart';
import '../stores/topics_form_store.dart';
import '../stores/topics_list_store.dart';

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
    const host = TopicsFeatureModuleHost();
    return ModuleScope<TopicsFeatureModule>(
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
    final binder = provider?.controller.binder;
    final listStore = binder?.tryGet<TopicsListStore>();
    final formStore = binder?.tryGet<TopicsFormStore>();
    if (listStore != null && formStore != null) {
      _statusCheckTimer?.cancel();
      return widget.child;
    }

    return const Center(
      child: Text('Loading topics', textDirection: TextDirection.ltr),
    );
  }
}
