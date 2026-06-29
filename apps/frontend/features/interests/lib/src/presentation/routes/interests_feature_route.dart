import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/interests_feature_module.dart';
import '../composition/interests_feature_module_host.dart';
import '../stores/interests_form_store.dart';
import '../stores/interests_list_store.dart';

class InterestsFeatureRoute extends StatelessWidget {
  InterestsFeatureRoute({super.key}) : _module = InterestsFeatureModule();

  InterestsFeatureRoute.demo({
    super.key,
    void Function(String interestId, String interestTitle)?
    onOpenInterestSources,
  }) : _module = InterestsFeatureModule.demo(
         onOpenInterestSources: onOpenInterestSources,
       );

  InterestsFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
    void Function(String interestId, String interestTitle)?
    onOpenInterestSources,
  }) : _module = InterestsFeatureModule.generatedApi(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
         onOpenInterestSources: onOpenInterestSources,
       );

  final InterestsFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    const host = InterestsFeatureModuleHost();
    return ModuleScope<InterestsFeatureModule>(
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
    final listStore = binder?.tryGet<InterestsListStore>();
    final formStore = binder?.tryGet<InterestsFormStore>();
    if (listStore != null && formStore != null) {
      _statusCheckTimer?.cancel();
      return widget.child;
    }

    return const Center(
      child: Text('Loading interests', textDirection: TextDirection.ltr),
    );
  }
}
